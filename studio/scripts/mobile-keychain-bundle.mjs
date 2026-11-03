import { spawnSync } from 'node:child_process';
import { X509Certificate, createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, lstat, cp, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { MOBILE_KEYCHAIN_BUNDLE_ID, MOBILE_KEYCHAIN_BUNDLE_NAME, MOBILE_KEYCHAIN_EXECUTABLE, MOBILE_KEYCHAIN_SIGN_IGNORE } from '../apps/desktop/src/mobile-keychain-layout.mjs';
export { MOBILE_KEYCHAIN_BUNDLE_ID, MOBILE_KEYCHAIN_BUNDLE_NAME, MOBILE_KEYCHAIN_EXECUTABLE, MOBILE_KEYCHAIN_SIGN_IGNORE };
const profileLimit=4*1024*1024;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const insist=(value,message)=>{if(!value)throw new Error(message);};
const signingKind=name=>name.startsWith('Developer ID Application:')?'developer-id':/^(Apple Development|Mac Developer):/.test(name)?'development':/^(Apple Distribution|Mac App Distribution|3rd Party Mac Developer Application):/.test(name)?'distribution':undefined;
export function mobileKeychainConfiguration(env=process.env) {
  const profile=env.TWH_MOBILE_KEYCHAIN_PROFILE?.trim(),identity=env.TWH_MOBILE_KEYCHAIN_IDENTITY?.trim(),team=env.TWH_MOBILE_KEYCHAIN_TEAM_ID?.trim();
  if(!profile&&!identity&&!team)return {enabled:false};
  insist(profile&&identity&&team,'Mobile Keychain signing requires an explicit profile, identity and Team ID; partial configuration is not downgraded.');
  insist(path.isAbsolute(profile)&&!profile.includes('\0'),'TWH_MOBILE_KEYCHAIN_PROFILE must be an absolute file path.');
  insist(/^[A-Z0-9]{10}$/.test(team),'TWH_MOBILE_KEYCHAIN_TEAM_ID must contain the confirmed ten-character Team ID.');
  return {enabled:true,profile,identity,team};
}
export function signingIdentities(output) {
  return output.split('\n').flatMap(line=>{const match=line.match(/^\s*\d+\)\s+([A-Fa-f0-9]{40})\s+"([^"\r\n]+)"/);return match?[{hash:match[1].toUpperCase(),name:match[2],kind:signingKind(match[2])}]:[];});
}
export function mobileKeychainBuildPlan({configuration,profile,identities,architecture,provisioningUDID,now=Date.now()}) {
  if(!configuration.enabled)return {enabled:false};
  const team=configuration.team;
  insist(['arm64','x86_64'].includes(architecture),'The native Keychain helper supports an explicit arm64 or x86_64 build.');
  insist(profile?.TeamIdentifier?.length===1&&profile.TeamIdentifier[0]===team,'The Mobile Keychain profile belongs to a different Team.');
  insist(profile.Platform?.some(value=>value==='OSX'||value==='macOS'),'The Mobile Keychain helper requires a native macOS provisioning profile.');
  insist(Number.isFinite(Date.parse(profile.ExpirationDate))&&Date.parse(profile.ExpirationDate)>now,'The Mobile Keychain profile is expired or has no valid expiry.');
  const entitlements=profile.Entitlements||{},app=entitlements['com.apple.application-identifier'];
  insist(typeof app==='string','The profile has no product helper App ID authorization.');
  const prefix=app.split('.')[0],productAppID=prefix+'.'+MOBILE_KEYCHAIN_BUNDLE_ID;
  insist(/^[A-Z0-9]{10}$/.test(prefix)&&profile.ApplicationIdentifierPrefix?.includes(prefix),'The helper App ID prefix is not authorized by this profile.');
  insist(entitlements['com.apple.developer.team-identifier']===team,'The profile Team entitlement does not match the signing Team.');
  const group=prefix+'.com.thewayhere.shared',groups=entitlements['keychain-access-groups'];
  insist(Array.isArray(groups)&&groups.some(value=>value===group||value===prefix+'.*'),'The profile does not authorize the shared Keychain group.');
  const selected=identities.filter(item=>item.hash===configuration.identity.toUpperCase()||item.name===configuration.identity);
  insist(selected.length===1&&selected[0].kind,'Select exactly one installed Apple code-signing identity by full name or SHA-1 fingerprint.');
  const identity=selected[0];
  const certificate=profile.DeveloperCertificates?.find(item=>item.sha1===identity.hash);
  insist(certificate?.team===team&&certificate?.commonName===identity.name,'The selected identity is not a same-Team certificate authorized by the profile.');
  const development=identity.kind==='development';
  const wildcard=development&&/^[A-Z0-9]{10}\.(?:[A-Za-z0-9-]+\.)*\*$/.test(app)&&productAppID.startsWith(app.slice(0,-1));
  insist(app===productAppID||wildcard,'The profile must authorize the exact product helper App ID; only covering terminal development wildcards are allowed.');
  if(development)insist(Array.isArray(profile.ProvisionedDevices)&&profile.ProvisionedDevices.length>0&&typeof provisioningUDID==='string'&&profile.ProvisionedDevices.includes(provisioningUDID)&&profile.ProvisionsAllDevices!==true,'The development helper profile must authorize this Mac provisioning UDID.');
  else insist(!profile.ProvisionedDevices?.length&&!entitlements['com.apple.security.get-task-allow'],'A distribution helper cannot use a development profile.');
  const requested={'com.apple.application-identifier':productAppID,'com.apple.developer.team-identifier':team,'keychain-access-groups':[group]};
  if(entitlements['com.apple.security.app-sandbox']===true)requested['com.apple.security.app-sandbox']=true;
  return {enabled:true,bundleID:MOBILE_KEYCHAIN_BUNDLE_ID,bundleName:MOBILE_KEYCHAIN_BUNDLE_NAME,executable:MOBILE_KEYCHAIN_EXECUTABLE,executableRelativePath:'Contents/MacOS/'+MOBILE_KEYCHAIN_EXECUTABLE,profileRelativePath:'Contents/embedded.provisionprofile',architecture,team,group,identityHash:identity.hash,signingKind:identity.kind,expiresAt:profile.ExpirationDate,entitlements:requested,timestamp:development?'none':'secure'};
}
function parentCandidates({identity,type,platform,identities}) {
  insist(typeof identity==='string'&&identity.trim(),'A profile-enabled helper requires an explicitly signed desktop parent.');
  const kind=type==='development'?'development':platform==='mas'?'distribution':'developer-id';
  return {kind,selected:identities.filter(item=>item.kind===kind&&(item.hash===identity.toUpperCase()||item.name===identity||item.name.includes(identity)))};
}
function certificateMetadata(certificate) {
  return {sha1:certificate.fingerprint.replaceAll(':','').toUpperCase(),team:certificate.subject.match(/(?:^|\n)OU=([^\n]+)/)?.[1],commonName:certificate.subject.match(/(?:^|\n)CN=([^\n]+)/)?.[1]};
}
function parentCertificate(identity,profile,run) {
  const embedded=profile.DeveloperCertificates.find(item=>item.sha1===identity.hash&&item.commonName===identity.name);
  if(embedded)return {...identity,team:embedded.team};
  // Only the selected signer's public certificate is queried, never a private
  // key or a provider credential. A CN suffix is not an authoritative Team ID.
  const pem=run('/usr/bin/security',['find-certificate','-a','-c',identity.name,'-p']).stdout;
  const candidates=(pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)||[]).map(value=>certificateMetadata(new X509Certificate(value))).filter(item=>item.sha1===identity.hash&&item.commonName===identity.name);
  insist(candidates.length===1,'The desktop signing identity could not be bound to its public certificate Team.');
  return {...identity,team:candidates[0].team};
}
export function validateMobileKeychainParent({plan,identity,type,platform,identities,appID}) {
  insist(['com.thewayhere.desktop','com.thewayhere.desktop.dev'].includes(appID),'The shared helper may only be packaged in its authorized desktop parent.');
  const {kind,selected}=parentCandidates({identity,type,platform,identities});
  insist(selected.length===1&&selected[0].team===plan.team,'The desktop parent signing identity must resolve uniquely to the helper Team.');
  insist(plan.signingKind===kind,'The helper profile/certificate must use the same development or distribution channel as the parent.');
  return selected[0];
}
export function mobileKeychainBuildCommands(plan,{source,bundle,moduleCache,entitlements}) {
  insist(plan.enabled,'A disabled helper has no signing/build command plan.');
  return {
    compile:['xcrun',['swiftc','-O','-module-name','TWHMobileKeychainHelper','-module-cache-path',moduleCache,'-target',plan.architecture+'-apple-macosx13.0',source,'-o',path.join(bundle,plan.executableRelativePath)]],
    sign:['/usr/bin/codesign',['--force','--sign',plan.identityHash,'--options','runtime','--timestamp'+(plan.timestamp==='none'?'=none':''),'--generate-entitlement-der','--entitlements',entitlements,bundle]],
  };
}
function nativeTool(command,args,options={}) {
  const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:8*1024*1024,timeout:command==='xcrun'?120000:30000,...options});
  insist(result.status===0&&!result.error,'Mobile Keychain '+path.basename(command)+' validation/build step failed; no unsigned fallback was selected.');
  return {stdout:result.stdout||'',stderr:result.stderr||''};
}
function plistObject(bytes,run=nativeTool) {
  const code='import plistlib,json,sys\np=plistlib.loads(sys.stdin.buffer.read())\nprint(json.dumps(p))';
  return JSON.parse(run('/usr/bin/python3',['-c',code],{input:bytes}).stdout);
}
export function decodeMobileKeychainProfile(bytes,run=nativeTool) {
  insist(bytes.length>0&&bytes.length<=profileLimit,'The explicit Mobile Keychain provisioning profile is empty or too large.');
  const decoded=run('/usr/bin/security',['cms','-D'],{input:bytes}).stdout;
  const python=`import plistlib,json,sys,base64
p=plistlib.loads(sys.stdin.buffer.read())
e=p.get('Entitlements',{})
print(json.dumps({'TeamIdentifier':p.get('TeamIdentifier',[]),'ApplicationIdentifierPrefix':p.get('ApplicationIdentifierPrefix',[]),'Platform':p.get('Platform',[]),'ExpirationDate':p['ExpirationDate'].isoformat(),'ProvisionedDevices':p.get('ProvisionedDevices',[]),'ProvisionsAllDevices':p.get('ProvisionsAllDevices',False),'Entitlements':{k:e[k] for k in ['com.apple.application-identifier','com.apple.developer.team-identifier','keychain-access-groups','com.apple.security.get-task-allow','com.apple.security.app-sandbox'] if k in e},'DeveloperCertificates':[base64.b64encode(x).decode() for x in p.get('DeveloperCertificates',[])]}))`;
  const metadata=JSON.parse(run('/usr/bin/python3',['-c',python],{input:decoded}).stdout);
  metadata.DeveloperCertificates=metadata.DeveloperCertificates.map(encoded=>{
    const certificate=new X509Certificate(Buffer.from(encoded,'base64'));
    return certificateMetadata(certificate);
  });
  return metadata;
}
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
function plistValue(value) {return Array.isArray(value)?'<array>'+value.map(plistValue).join('')+'</array>':typeof value==='boolean'?value?'<true/>':'<false/>':'<string>'+xml(value)+'</string>';}
export function mobileKeychainPlist(object) {return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>'+Object.entries(object).map(([key,value])=>'<key>'+xml(key)+'</key>'+plistValue(value)).join('')+'</dict></plist>\n';}
function locations(studioRoot) {const dist=path.join(studioRoot,'apps/desktop/dist');return {dist,bundle:path.join(dist,MOBILE_KEYCHAIN_BUNDLE_NAME),metadata:path.join(dist,'mobile-keychain-bundle.json'),source:path.join(studioRoot,'apps/desktop/native/MobileKeychain.swift')};}
async function signedProfilePlan(studioRoot,configuration,architecture,run) {
  const info=await lstat(configuration.profile);insist(info.isFile()&&info.size<=profileLimit,'The explicit Mobile Keychain profile must be a regular, bounded file.');
  const bytes=await readFile(configuration.profile),profile=decodeMobileKeychainProfile(bytes,run),identities=signingIdentities(run('/usr/bin/security',['find-identity','-v','-p','codesigning']).stdout);
  // Apple Silicon provisioning UDID differs from IOPlatformUUID. Keep the raw
  // device identifier local to validation, never in generated bundle metadata.
  let provisioningUDID;
  if(profile.ProvisionedDevices?.length) {
    const hardware=JSON.parse(run('/usr/sbin/system_profiler',['SPHardwareDataType','-json']).stdout);
    provisioningUDID=hardware.SPHardwareDataType?.[0]?.provisioning_UDID;
  }
  return {bytes,identities,profile,plan:mobileKeychainBuildPlan({configuration,profile,identities,architecture,provisioningUDID}),profileDigest:sha256(bytes)};
}
export async function verifyMobileKeychainBundle(bundle,plan,{profileDigest,sourceDigest,metadata,run=nativeTool}) {
  for(const item of [bundle,path.join(bundle,'Contents'),path.join(bundle,'Contents/MacOS'),path.join(bundle,plan.executableRelativePath),path.join(bundle,plan.profileRelativePath),path.join(bundle,'Contents/Info.plist')])insist(!(await lstat(item)).isSymbolicLink(),'The product helper bundle may not contain symbolic-link signing inputs.');
  run('/usr/bin/codesign',['--verify','--strict','--verbose=2','-R=anchor apple generic and certificate leaf[subject.OU] = "'+plan.team+'" and identifier "'+plan.bundleID+'"',bundle]);
  const signature=run('/usr/bin/codesign',['-d','--verbose=4',bundle]);
  const lines=signature.stdout+'\n'+signature.stderr;
  insist(lines.match(/^TeamIdentifier=(.+)$/m)?.[1]===plan.team&&lines.match(/^Identifier=(.+)$/m)?.[1]===plan.bundleID,'The signed helper Team or bundle identifier does not match its profile.');
  const entitlements=plistObject(run('/usr/bin/codesign',['-d','--entitlements',':-',bundle]).stdout,run);
  insist(entitlements['com.apple.application-identifier']===plan.entitlements['com.apple.application-identifier']&&entitlements['com.apple.developer.team-identifier']===plan.team&&JSON.stringify(entitlements['keychain-access-groups'])===JSON.stringify([plan.group]),'The signed helper lost its exact profile-authorized Keychain entitlements.');
  const info=plistObject(await readFile(path.join(bundle,'Contents/Info.plist')),run);
  insist(info.CFBundleIdentifier===plan.bundleID&&info.CFBundleExecutable===plan.executable,'The helper executable or bundle metadata was replaced.');
  insist(sha256(await readFile(path.join(bundle,plan.profileRelativePath)))===profileDigest,'The embedded helper profile differs from the explicitly validated profile.');
  if(metadata)insist(metadata.version===1&&metadata.sourceDigest===sourceDigest&&metadata.profileDigest===profileDigest&&metadata.team===plan.team&&metadata.identityHash===plan.identityHash&&metadata.architecture===plan.architecture&&metadata.group===plan.group&&metadata.binaryDigest===sha256(await readFile(path.join(bundle,plan.executableRelativePath))),'The helper build is stale or does not match the explicit profile/signing plan. Rebuild the native desktop helpers.');
}
export async function buildMobileKeychainBundle({studioRoot,env=process.env,architecture=process.arch==='arm64'?'arm64':process.arch==='x64'?'x86_64':undefined,run=nativeTool}={}) {
  const output=locations(studioRoot),configuration=mobileKeychainConfiguration(env);
  if(!configuration.enabled) {await rm(output.bundle,{recursive:true,force:true});await rm(output.metadata,{force:true});return {enabled:false};}
  const {bytes,plan,profileDigest}=await signedProfilePlan(studioRoot,configuration,architecture,run),sourceDigest=sha256(await readFile(output.source));
  await mkdir(path.join(studioRoot,'.runtime'),{recursive:true});await mkdir(output.dist,{recursive:true});
  const staging=await mkdtemp(path.join(studioRoot,'.runtime/mobile-keychain-build-'));
  try {
    const bundle=path.join(staging,plan.bundleName),contents=path.join(bundle,'Contents');await mkdir(path.join(contents,'MacOS'),{recursive:true});
    const version=JSON.parse(await readFile(path.join(studioRoot,'apps/desktop/package.json'),'utf8')).version;
    insist(typeof version==='string'&&/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version),'The desktop version is invalid for the helper bundle.');
    await writeFile(path.join(contents,'Info.plist'),mobileKeychainPlist({CFBundleIdentifier:plan.bundleID,CFBundleExecutable:plan.executable,CFBundleName:'Mobile Keychain Helper',CFBundlePackageType:'APPL',CFBundleVersion:version.split(/[-+]/)[0],CFBundleShortVersionString:version.split(/[-+]/)[0],LSBackgroundOnly:true,LSMinimumSystemVersion:'13.0'}),{mode:0o644});
    await writeFile(path.join(bundle,plan.profileRelativePath),bytes,{mode:0o644});
    const entitlements=path.join(staging,'Helper.entitlements');await writeFile(entitlements,mobileKeychainPlist(plan.entitlements),{mode:0o600});
    const commands=mobileKeychainBuildCommands(plan,{source:output.source,bundle,moduleCache:path.join(studioRoot,'.runtime/native-module-cache'),entitlements});
    run(...commands.compile);
    insist(sha256(await readFile(output.source))===sourceDigest,'The Keychain helper source changed during compilation; rebuild before signing.');
    run(...commands.sign);
    await verifyMobileKeychainBundle(bundle,plan,{profileDigest,sourceDigest,run});
    const metadata={version:1,sourceDigest,profileDigest,team:plan.team,identityHash:plan.identityHash,architecture:plan.architecture,group:plan.group,binaryDigest:sha256(await readFile(path.join(bundle,plan.executableRelativePath)))};
    await rm(output.bundle,{recursive:true,force:true});await rename(bundle,output.bundle);await writeFile(output.metadata,JSON.stringify(metadata,null,2)+'\n',{mode:0o600});
    return {enabled:true,bundle:output.bundle,team:plan.team,bundleID:plan.bundleID};
  } finally {await rm(staging,{recursive:true,force:true});}
}
export function packagedMobileKeychainPaths(context) {
  const product=context.packager.appInfo.productFilename;
  insist(typeof product==='string'&&product&&path.basename(product)===product&&product!=='.'&&product!=='..','Invalid desktop product filename for helper packaging.');
  const app=path.join(context.appOutDir,product+'.app');return {app,bundle:path.join(app,'Contents/Helpers',MOBILE_KEYCHAIN_BUNDLE_NAME),bare:path.join(app,'Contents/Resources/native/mobile-keychain')};
}
async function requireSafePackageOutput(context,target) {
  const root=path.resolve(context.appOutDir),relative=path.relative(root,target.bundle);
  insist(relative&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative),'The nested helper must stay inside the generated package output.');
  let current=root;
  for(const component of ['',...relative.split(path.sep)]) {if(component)current=path.join(current,component);try{insist(!(await lstat(current)).isSymbolicLink(),'The generated helper output contains a symbolic-link ancestor.');}catch(error){if(error.code!=='ENOENT')throw error;}}
}
function packageSigningOptions(context) {
  const cfg=context.packager.config||{},active=context.packager._activePackConfig;
  if(active)return active;
  if(context.electronPlatformName==='mas')return {...cfg.mac,...cfg.mas,...(context.targets?.some(target=>target.name==='mas-dev')?{...cfg.masDev,type:'development'}:{})};
  return context.packager.platformSpecificBuildOptions||cfg.mac||{};
}
export async function preparePackagedMobileKeychain(context,{env=process.env,run=nativeTool}={}) {
  if(!['darwin','mas'].includes(context.electronPlatformName))return;
  const target=packagedMobileKeychainPaths(context),configuration=mobileKeychainConfiguration(env);
  await requireSafePackageOutput(context,target);
  if(!configuration.enabled) {await rm(target.bundle,{recursive:true,force:true});return {enabled:false};}
  const architecture=typeof context.arch==='number'?({1:'x86_64',3:'arm64'})[context.arch]:context.arch==='x64'?'x86_64':context.arch|| (process.arch==='arm64'?'arm64':'x86_64');
  const source=locations(context.packager.projectDir),{plan,profileDigest,identities,profile}=await signedProfilePlan(context.packager.projectDir,configuration,architecture,run),options=packageSigningOptions(context);
  const parent=parentCandidates({identity:options.identity,type:options.type,platform:context.electronPlatformName,identities});
  insist(parent.selected.length===1,'The desktop signing identity must resolve uniquely before packaging the shared helper.');
  const verifiedParent=parentCertificate(parent.selected[0],profile,run);
  validateMobileKeychainParent({plan,identity:options.identity,type:options.type,platform:context.electronPlatformName,identities:[verifiedParent],appID:context.packager.config?.appId});
  const ignore=Array.isArray(options.signIgnore)?options.signIgnore:[options.signIgnore].filter(Boolean);
  insist(ignore.some(pattern=>new RegExp(pattern).test(target.bundle)&&new RegExp(pattern).test(path.join(target.bundle,plan.executableRelativePath))),'The desktop signer must preserve the independently signed MobileKeychain.app and its exact entitlements.');
  const sourceDigest=sha256(await readFile(source.source)),metadata=JSON.parse(await readFile(source.metadata,'utf8'));
  await verifyMobileKeychainBundle(source.bundle,plan,{profileDigest,sourceDigest,metadata,run});
  await mkdir(path.dirname(target.bundle),{recursive:true});await rm(target.bundle,{recursive:true,force:true});await cp(source.bundle,target.bundle,{recursive:true,dereference:false,errorOnExist:true});
  await verifyMobileKeychainBundle(target.bundle,plan,{profileDigest,sourceDigest,metadata,run});
  await rm(target.bare,{force:true});return {enabled:true};
}
export async function verifyPackagedMobileKeychain(context,{env=process.env,run=nativeTool}={}) {
  if(!['darwin','mas'].includes(context.electronPlatformName))return;
  const configuration=mobileKeychainConfiguration(env),target=packagedMobileKeychainPaths(context);
  await requireSafePackageOutput(context,target);
  if(!configuration.enabled) {try{await lstat(target.bundle);throw new Error('A shared-Keychain helper was packaged without an explicit signing profile.');}catch(error){if(error.code!=='ENOENT')throw error;}return {enabled:false};}
  const architecture=typeof context.arch==='number'?({1:'x86_64',3:'arm64'})[context.arch]:context.arch==='x64'?'x86_64':context.arch||(process.arch==='arm64'?'arm64':'x86_64');
  const {plan,profileDigest}=await signedProfilePlan(context.packager.projectDir,configuration,architecture,run),source=locations(context.packager.projectDir),sourceDigest=sha256(await readFile(source.source)),metadata=JSON.parse(await readFile(source.metadata,'utf8'));
  await verifyMobileKeychainBundle(target.bundle,plan,{profileDigest,sourceDigest,metadata,run});
  run('/usr/bin/codesign',['--verify','--deep','--strict','-R=anchor apple generic and certificate leaf[subject.OU] = "'+plan.team+'" and (identifier "com.thewayhere.desktop" or identifier "com.thewayhere.desktop.dev")',target.app]);
  const signature=run('/usr/bin/codesign',['-d','--verbose=4',target.app]),lines=signature.stdout+'\n'+signature.stderr;
  insist(lines.match(/^TeamIdentifier=(.+)$/m)?.[1]===plan.team&&['com.thewayhere.desktop','com.thewayhere.desktop.dev'].includes(lines.match(/^Identifier=(.+)$/m)?.[1]),'The final desktop signature is not an authorized same-Team parent for Mobile Keychain.');
  return {enabled:true};
}
