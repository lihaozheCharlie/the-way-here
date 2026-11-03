import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, symlink, rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { mobileKeychainConfiguration, signingIdentities, mobileKeychainBuildPlan, mobileKeychainBuildCommands, validateMobileKeychainParent, packagedMobileKeychainPaths, buildMobileKeychainBundle, preparePackagedMobileKeychain, verifyPackagedMobileKeychain, mobileKeychainPlist, MOBILE_KEYCHAIN_BUNDLE_ID, MOBILE_KEYCHAIN_SIGN_IGNORE } from '../../../scripts/mobile-keychain-bundle.mjs';
const team='TEST123456',hash='A'.repeat(40),name='Developer ID Application: Anonymous Owner ('+team+')';
const config={enabled:true,profile:'/anonymous/MobileKeychain.provisionprofile',identity:hash,team};
const identity={hash,name,team,kind:'developer-id'};
function profile(){return{TeamIdentifier:[team],ApplicationIdentifierPrefix:[team],Platform:['OSX'],ExpirationDate:'2030-01-01T00:00:00Z',Entitlements:{'com.apple.application-identifier':team+'.'+MOBILE_KEYCHAIN_BUNDLE_ID,'com.apple.developer.team-identifier':team,'keychain-access-groups':[team+'.*']},DeveloperCertificates:[{sha1:hash,team,commonName:name}]};}
const plan=(value=profile(),options={})=>mobileKeychainBuildPlan({configuration:config,profile:value,identities:[identity],architecture:'arm64',now:Date.parse('2026-01-01T00:00:00Z'),...options});
test('shared signing is disabled only when no explicit configuration was supplied',()=>{
  assert.deepEqual(mobileKeychainConfiguration({}),{enabled:false});
  const env={TWH_MOBILE_KEYCHAIN_PROFILE:'/anonymous/profile',TWH_MOBILE_KEYCHAIN_IDENTITY:hash,TWH_MOBILE_KEYCHAIN_TEAM_ID:team};
  assert.deepEqual(mobileKeychainConfiguration(env),{...config,profile:'/anonymous/profile'});
  for(const key of Object.keys(env)){const partial={...env};delete partial[key];assert.throws(()=>mobileKeychainConfiguration(partial),/partial|requires/);}
  assert.throws(()=>mobileKeychainConfiguration({...env,TWH_MOBILE_KEYCHAIN_PROFILE:'relative/profile'}),/absolute/);
  assert.throws(()=>mobileKeychainConfiguration({...env,TWH_MOBILE_KEYCHAIN_TEAM_ID:'not-a-team'}),/Team/);
});
test('profile authorization creates only the exact product helper identity and shared group',()=>{
  const value=plan();assert.equal(value.bundleID,'com.thewayhere.desktop.mobile-keychain');assert.equal(value.executableRelativePath,'Contents/MacOS/mobile-keychain');assert.equal(value.profileRelativePath,'Contents/embedded.provisionprofile');
  assert.deepEqual(value.entitlements,{'com.apple.application-identifier':team+'.'+MOBILE_KEYCHAIN_BUNDLE_ID,'com.apple.developer.team-identifier':team,'keychain-access-groups':[team+'.com.thewayhere.shared']});
  const exact=profile();exact.Entitlements['keychain-access-groups']=[team+'.com.thewayhere.shared'];assert.equal(plan(exact).group,team+'.com.thewayhere.shared');
  assert.equal(value.timestamp,'secure');assert.equal(value.identityHash,hash);
});
test('wrong Team, QA/distribution-wildcard App ID, group, expiry, platform and certificate are rejected, never downgraded',()=>{
  const variants=[p=>p.TeamIdentifier=['OTHER12345'],p=>p.Entitlements['com.apple.developer.team-identifier']='OTHER12345',p=>p.Entitlements['com.apple.application-identifier']=team+'.*',p=>p.Entitlements['com.apple.application-identifier']=team+'.com.thewayhere.keychain.acceptance',p=>p.Entitlements['keychain-access-groups']=['OTHER12345.*'],p=>p.Entitlements['keychain-access-groups']=['*'],p=>p.ApplicationIdentifierPrefix=['OTHER12345'],p=>p.ExpirationDate='2020-01-01T00:00:00Z',p=>p.Platform=['iOS'],p=>p.DeveloperCertificates[0].sha1='B'.repeat(40),p=>p.DeveloperCertificates[0].team='OTHER12345',p=>p.ProvisionedDevices=['anonymous-device'],p=>p.Entitlements['com.apple.security.get-task-allow']=true];
  for(const change of variants){const p=profile();change(p);assert.throws(()=>plan(p));}
  assert.throws(()=>plan(profile(),{architecture:'universal'}),/architecture|explicit/);
});
test('development identity remains explicit and cannot be packaged as a distribution helper',()=>{
  const developmentName='Apple Development: Anonymous Owner (PERSONAL00)';const p=profile();p.DeveloperCertificates[0].commonName=developmentName;p.ProvisionedDevices=['anonymous-test-Mac'];p.Entitlements['com.apple.security.get-task-allow']=true;
  const development=plan(p,{identities:[{...identity,name:developmentName,kind:'development'}],provisioningUDID:'anonymous-test-Mac'});
  assert.equal(development.timestamp,'none');assert.equal(development.signingKind,'development');assert.equal(development.entitlements['com.apple.security.get-task-allow'],undefined);
  assert.throws(()=>validateMobileKeychainParent({plan:development,identity:name,platform:'darwin',identities:[identity],appID:'com.thewayhere.desktop'}),/channel/);
});
test('signing identity resolution is exact for the helper and same-Team/channel for the parent',()=>{
  const parsed=signingIdentities('  1) '+hash+' "'+name+'"\n  2) '+'B'.repeat(40)+' "Apple Development: Anonymous Owner (OTHER12345)"\n     2 valid identities found');
  assert.equal(parsed.length,2);assert.deepEqual(parsed[0],{hash,name,kind:'developer-id'});
  assert.equal(plan(profile(),{configuration:{...config,identity:name}}).identityHash,hash);
  assert.throws(()=>plan(profile(),{configuration:{...config,identity:'Anonymous Owner'}}),/exactly one/);
  assert.equal(validateMobileKeychainParent({plan:plan(),identity:'Anonymous Owner ('+team+')',platform:'darwin',identities:[{...parsed[0],team}],appID:'com.thewayhere.desktop'}).hash,hash);
  assert.throws(()=>validateMobileKeychainParent({plan:plan(),identity:null,platform:'darwin',identities:parsed,appID:'com.thewayhere.desktop'}),/explicitly signed/);
  assert.throws(()=>validateMobileKeychainParent({plan:plan(),identity:name,platform:'darwin',identities:[{...identity,team:'OTHER12345'}],appID:'com.thewayhere.desktop'}),/Team/);
  assert.throws(()=>validateMobileKeychainParent({plan:plan(),identity:name,platform:'darwin',identities:parsed,appID:'com.unrelated.app'}),/authorized/);
});
test('production build commands compile the real source and sign only the validated nested app',()=>{
  const value=plan(),bundle='/anonymous/dist/MobileKeychain.app';
  const commands=mobileKeychainBuildCommands(value,{source:'/anonymous/MobileKeychain.swift',bundle,moduleCache:'/anonymous/cache',entitlements:'/anonymous/Helper.entitlements'});
  assert.equal(commands.compile[0],'xcrun');assert.ok(commands.compile[1].includes('arm64-apple-macosx13.0'));assert.equal(commands.compile[1].at(-1),bundle+'/Contents/MacOS/mobile-keychain');
  assert.equal(commands.compile[1].includes('-D'),false);assert.equal(commands.compile[1].some(x=>x.includes('AUTH_TESTS')),false);
  assert.equal(commands.sign[0],'/usr/bin/codesign');assert.equal(commands.sign[1][commands.sign[1].indexOf('--sign')+1],hash);assert.equal(commands.sign[1].at(-1),bundle);assert.ok(commands.sign[1].includes('--timestamp'));assert.equal(commands.sign[1].includes('--deep'),false);
  assert.throws(()=>mobileKeychainBuildCommands({enabled:false},{}));
});
test('packaged helper has a bounded standard location and signer preserves exactly that nested app',()=>{
  const context={appOutDir:'/anonymous/output',packager:{appInfo:{productFilename:'The Way Here'}}};const files=packagedMobileKeychainPaths(context);
  assert.equal(files.bundle,'/anonymous/output/The Way Here.app/Contents/Helpers/MobileKeychain.app');
  const ignore=new RegExp(MOBILE_KEYCHAIN_SIGN_IGNORE);assert.equal(ignore.test(files.bundle),true);assert.equal(ignore.test(files.bundle+'/Contents/MacOS/mobile-keychain'),true);assert.equal(ignore.test(files.bundle+'-other'),false);assert.equal(ignore.test('/anonymous/Other.app/Contents/MacOS/main'),false);
  assert.throws(()=>packagedMobileKeychainPaths({...context,packager:{appInfo:{productFilename:'../../outside'}}}));
});
test('unconfigured builds remove stale generated capabilities but preserve bare helpers and other files',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'twh-helper-plan-anonymous-'));
  try{const dist=path.join(root,'apps/desktop/dist');await mkdir(path.join(dist,'MobileKeychain.app/Contents'),{recursive:true});await writeFile(path.join(dist,'mobile-keychain-bundle.json'),'anonymous stale metadata');await writeFile(path.join(dist,'mobile-keychain'),'anonymous bare helper');await writeFile(path.join(dist,'preserved'),'anonymous unrelated asset');
    assert.deepEqual(await buildMobileKeychainBundle({studioRoot:root,env:{},run:()=>{throw new Error('No signing tool may run');}}),{enabled:false});
    await assert.rejects(access(path.join(dist,'MobileKeychain.app')));await assert.rejects(access(path.join(dist,'mobile-keychain-bundle.json')));assert.equal(await readFile(path.join(dist,'mobile-keychain'),'utf8'),'anonymous bare helper');assert.equal(await readFile(path.join(dist,'preserved'),'utf8'),'anonymous unrelated asset');
  }finally{await rm(root,{recursive:true,force:true});}
});
test('unconfigured afterPack/afterSign never use signing tools, preserve fuses, and remove stale bundle output',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'twh-helper-pack-anonymous-'));
  try{const fuses={runAsNode:false,enableNodeOptionsEnvironmentVariable:false};const context={appOutDir:path.join(root,'out'),electronPlatformName:'darwin',packager:{projectDir:root,appInfo:{productFilename:'Anonymous'},config:{electronFuses:fuses,mac:{identity:null}}}};
    const files=packagedMobileKeychainPaths(context);await mkdir(path.join(files.bundle,'Contents'),{recursive:true});await mkdir(path.dirname(files.bare),{recursive:true});await writeFile(files.bare,'anonymous bare helper');
    const tools={env:{},run:()=>{throw new Error('No real signing tools or keys may be used');}};
    assert.deepEqual(await preparePackagedMobileKeychain(context,tools),{enabled:false});assert.deepEqual(await verifyPackagedMobileKeychain(context,tools),{enabled:false});
    await assert.rejects(access(files.bundle));assert.equal(await readFile(files.bare,'utf8'),'anonymous bare helper');assert.deepEqual(context.packager.config.electronFuses,fuses);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('generated Info/entitlement plist strings cannot inject XML keys',()=>{const xml=mobileKeychainPlist({Name:'Anonymous & <key>Unexpected</key>',Allowed:['anonymous'],Sandbox:true});assert.ok(xml.includes('Anonymous &amp; &lt;key&gt;Unexpected&lt;/key&gt;'));assert.ok(xml.includes('<true/>'));});

test('a package output symlink cannot redirect stale-helper cleanup outside the generated app',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'twh-helper-symlink-anonymous-'));
  try {const context={appOutDir:path.join(root,'out'),electronPlatformName:'darwin',packager:{projectDir:root,appInfo:{productFilename:'Anonymous'},config:{}}};const files=packagedMobileKeychainPaths(context);const outside=path.join(root,'preserved-outside');await mkdir(path.join(outside,'MobileKeychain.app'),{recursive:true});await writeFile(path.join(outside,'MobileKeychain.app/preserved'),'anonymous sentinel');await mkdir(path.dirname(path.dirname(files.bundle)),{recursive:true});await symlink(outside,path.dirname(files.bundle));
    await assert.rejects(preparePackagedMobileKeychain(context,{env:{},run:()=>{throw new Error('No tool may run');}}),/symbolic-link/);assert.equal(await readFile(path.join(outside,'MobileKeychain.app/preserved'),'utf8'),'anonymous sentinel');
  }finally{await rm(root,{recursive:true,force:true});}
});

test('development allowlist wildcards authorize only the exact final product entitlement on the allowed Mac',()=>{
 const developmentName='Apple Development: Anonymous Owner (PERSONAL00)';
 const p=profile();p.DeveloperCertificates[0].commonName=developmentName;p.ProvisionedDevices=['anonymous-test-Mac'];
 const options={identities:[{...identity,name:developmentName,kind:'development'}],provisioningUDID:'anonymous-test-Mac'};
 for(const allowed of [team+'.*',team+'.com.*',team+'.com.thewayhere.*',team+'.'+MOBILE_KEYCHAIN_BUNDLE_ID]) {
  p.Entitlements['com.apple.application-identifier']=allowed;
  const value=plan(p,options);assert.equal(value.entitlements['com.apple.application-identifier'],team+'.'+MOBILE_KEYCHAIN_BUNDLE_ID);assert.deepEqual(value.entitlements['keychain-access-groups'],[team+'.com.thewayhere.shared']);
 }
 for(const wildcard of [team+'.*',team+'.com.thewayhere.*']) {const distribution=profile();distribution.Entitlements['com.apple.application-identifier']=wildcard;assert.throws(()=>plan(distribution),/App ID/);}
 for(const denied of [team+'.com.other.*',team+'.com.thewayhere.des*',team+'.com.*.mobile-keychain',team+'.com.**',team+'.com.thewayhere.keychain.acceptance','OTHER12345.*','*']) {
  p.Entitlements['com.apple.application-identifier']=denied;assert.throws(()=>plan(p,options));
 }
 p.Entitlements['com.apple.application-identifier']=team+'.*';
 for(const provisioningUDID of [undefined,'anonymous-other-Mac',''])assert.throws(()=>plan(p,{...options,provisioningUDID}),/provisioning UDID/);
 p.ProvisionsAllDevices=true;assert.throws(()=>plan(p,options),/provisioning UDID/);delete p.ProvisionsAllDevices;
 p.ExpirationDate='2020-01-01';assert.throws(()=>plan(p,options),/expired/);p.ExpirationDate='2030-01-01';
 p.DeveloperCertificates[0].team='OTHER12345';assert.throws(()=>plan(p,options),/certificate/);
});
