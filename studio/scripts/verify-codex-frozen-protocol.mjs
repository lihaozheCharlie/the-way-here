// Real bundled CLI, isolated anonymous HOME, no authentication and no model RPCs.
import { spawn, spawnSync } from 'node:child_process';
import { copyFile, cp, mkdtemp, mkdir, readdir, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
const studio=fileURLToPath(new URL('../',import.meta.url));
const originalBinary=await realpath(process.argv.slice(2).find(value=>!value.startsWith('--')) || path.join(studio,'.runtime/package/codex/bin/codex'));
let binary=originalBinary;
const hashFile=async file=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');};
const originalSha256=await hashFile(originalBinary);
const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'twh-anonymous-codex-compat-')));
const home=path.join(root,'home'),codexHome=path.join(root,'codex'),scope=path.join(root,'scope');
for(const folder of [home,codexHome,scope,path.join(root,'tmp')])await mkdir(folder,{recursive:true});
let copyBeforeSigningSha256;
if(process.argv.includes('--anonymous-adhoc-copy')){
 binary=path.join(root,'cli/bin/codex');await mkdir(path.dirname(binary),{recursive:true});await copyFile(originalBinary,binary);copyBeforeSigningSha256=await hashFile(binary);
 const libraries=path.join(root,'cli/lib');await cp(path.resolve(path.dirname(originalBinary),'../lib'),libraries,{recursive:true,dereference:true});
 const sign=target=>{const signed=spawnSync('/usr/bin/codesign',['--force','--sign','-',target],{encoding:'utf8'});if(signed.status!==0)throw new Error('Anonymous copy signing failed');};
 const signLibraries=async folder=>{for(const entry of await readdir(folder,{withFileTypes:true})){const target=path.join(folder,entry.name);if(entry.isDirectory())await signLibraries(target);else if(entry.name.endsWith('.dylib'))sign(target);}};
 await signLibraries(libraries);sign(binary);
}
const environment={PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:home,CODEX_HOME:codexHome,CODEX_SQLITE_HOME:path.join(root,'sqlite'),TMPDIR:path.join(root,'tmp'),XDG_CONFIG_HOME:path.join(root,'config'),XDG_CACHE_HOME:path.join(root,'cache'),XDG_DATA_HOME:path.join(root,'data'),LANG:'en_US.UTF-8',USER:'anonymous',LOGNAME:'anonymous',OPENAI_BASE_URL:'http://127.0.0.1:9'};
await writeFile(path.join(codexHome,'config.toml'),'model = "anonymous-offline-probe"\nmodel_provider = "anonymous_offline"\ncli_auth_credentials_store = "file"\nmcp_oauth_credentials_store = "file"\ncheck_for_update_on_startup = false\nweb_search = "disabled"\n[analytics]\nenabled = false\n[feedback]\nenabled = false\n[model_providers.anonymous_offline]\nname = "Anonymous offline protocol probe"\nbase_url = "http://127.0.0.1:9"\nwire_api = "responses"\nrequires_openai_auth = false\n',{mode:0o600});
const wrapper='/usr/bin/sandbox-exec',networkPolicy='(version 1)(allow default)(deny network*)';
const version=spawnSync(wrapper,['-p',networkPolicy,binary,'--version'],{cwd:scope,env:environment,encoding:'utf8',timeout:10000});
const disabled=['shell_tool','unified_exec','shell_snapshot','multi_agent','multi_agent_v2','hooks','apps','plugins','remote_plugin','skill_search','skill_mcp_dependency_install','workspace_dependencies','worktrees','view_image','computer_use','browser_use','browser_use_external','browser_use_full_cdp_access','in_app_browser','in_app_local_automation','in_app_voice','in_app_dictation','image_generation','goals','memories','sleep_tool','auth_elicitation','daemon_auto_start'];
const permissionProfile='twh-frozen-0123456789abcdef';
const profileRules='{":root"="deny",":minimal"="read",'+JSON.stringify(scope)+'="read"}';
const args=['-p',networkPolicy,binary,'app-server',...disabled.flatMap(feature=>['-c',`features.${feature}=false`]),'-c','features.skip_host_skill_discovery=true','-c','web_search="disabled"','-c','mcp_servers={}','-c',`permissions.${permissionProfile}.filesystem=${profileRules}`,'-c',`permissions.${permissionProfile}.network.enabled=false`,'-c',`default_permissions=${JSON.stringify(permissionProfile)}`];
const noOuterSeatbelt=process.argv.includes('--no-outer-seatbelt');
let child,sequence=0;const pending=new Map();const methods=[];let exited=false,stderr='';
const report={originalBinary,originalSha256,copyBeforeSigningSha256,binary,anonymousAdhocCopy:binary!==originalBinary,version:version.stdout.trim(),versionStatus:version.status,versionSignal:version.signal,versionError:version.error?.message,anonymousHomes:true,networkDeniedByOuterSeatbelt:!noOuterSeatbelt,commandNetworkDeniedByProfile:true,modelRequests:0,methods,restrictedAccessSupported:false,configConfirmed:false,processCleaned:false};
try {
 if(version.status!==0)throw new Error('Isolated CLI version probe failed: '+version.stderr.slice(-1000));
 const schemaDirectory=path.join(root,'generated-schema');
 const generated=spawnSync(wrapper,['-p',networkPolicy,binary,'app-server','generate-json-schema','--out',schemaDirectory,'--experimental'],{cwd:scope,env:environment,encoding:'utf8',timeout:20000,maxBuffer:2000000});
 report.schemaGeneration={status:generated.status,stderr:generated.stderr.slice(-1000)};
 if(generated.status===0){const exported=path.join(studio,'.runtime/ios/codex-0.162.1-schema');await rm(exported,{recursive:true,force:true});await cp(schemaDirectory,exported,{recursive:true});report.schemaDirectory=exported;}
 child=spawn(noOuterSeatbelt?binary:wrapper,noOuterSeatbelt?args.slice(3):args,{cwd:scope,env:environment,stdio:['pipe','pipe','pipe'],detached:true});
 child.stderr.on('data',data=>{stderr=(stderr+data).slice(-6000);});
 const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>{let value;try{value=JSON.parse(line);}catch{return;}if(value.id!==undefined&&pending.has(value.id)){const callback=pending.get(value.id);pending.delete(value.id);value.error?callback.reject(new Error(value.error.message)):callback.resolve(value.result);}});
 child.on('exit',()=>{exited=true;for(const callback of pending.values())callback.reject(new Error('Anonymous app-server exited'));pending.clear();});
 const request=(method,params)=>new Promise((resolve,reject)=>{if(!['initialize','config/read','permissionProfile/list','command/exec'].includes(method))return reject(new Error('Model RPC forbidden in anonymous probe'));methods.push(method);const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('Anonymous RPC timeout: '+method));},15000);pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});child.stdin.write(JSON.stringify({id,method,params})+'\n');});
 await request('initialize',{clientInfo:{name:'anonymous_twh_scope_probe',version:'1'},capabilities:{experimentalApi:true}});child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
 const config=await request('config/read',{includeLayers:false});
 report.modelProviderLoopbackOnly=config?.config?.model_provider==='anonymous_offline'&&config?.config?.model_providers?.anonymous_offline?.base_url==='http://127.0.0.1:9';
 if(!report.modelProviderLoopbackOnly)throw new Error('Anonymous loopback-only provider config was not confirmed');
 report.configConfirmed=Boolean(config?.config?.mcp_servers && !Object.keys(config.config.mcp_servers).length && config.config.features && disabled.every(feature=>config.config.features[feature]===false));
 report.returnedFeatureKeys=Object.keys(config?.config?.features||{});report.mcpEmpty=!Object.keys(config?.config?.mcp_servers||{}).length;
 const inside=path.join(scope,'inside.txt'),outside=path.join(root,'outside.txt'),token='ANONYMOUS-CODEX-POLICY-CANARY';await writeFile(inside,token);await writeFile(outside,token);
 const profiles=await request('permissionProfile/list',{cwd:scope});report.profileAvailable=profiles.data?.some(profile=>profile.id===permissionProfile&&profile.allowed===true)===true;
 const restricted={permissionProfile};
 try {
  const allowed=await request('command/exec',{command:['/bin/cat',inside],cwd:scope,...restricted,timeoutMs:5000});report.inside={exitCode:allowed.exitCode,matched:allowed.stdout===token,stderr:allowed.stderr};
  const denied=await request('command/exec',{command:['/bin/cat',outside],cwd:scope,...restricted,timeoutMs:5000});report.outside={exitCode:denied.exitCode,matched:denied.stdout===token,stderr:denied.stderr};
  report.restrictedAccessSupported=report.profileAvailable&&allowed.exitCode===0&&allowed.stdout===token&&denied.exitCode!==0&&!String(denied.stdout||'').includes(token);
 } catch(error){report.policyError=error.message;}
 report.failClosed=!report.configConfirmed||!report.restrictedAccessSupported;
 report.stderr=stderr;
} catch(error){report.error=error.message;report.failClosed=true;}
finally {
 if(child&&!exited){try{process.kill(-child.pid,'SIGTERM');}catch{}for(let i=0;i<50&&!exited;i++)await new Promise(resolve=>setTimeout(resolve,100));if(!exited){try{process.kill(-child.pid,'SIGKILL');}catch{}}for(let i=0;i<20&&!exited;i++)await new Promise(resolve=>setTimeout(resolve,50));}
 report.processCleaned=!child||exited;await rm(root,{recursive:true,force:true});report.anonymousHomesRemoved=true;
 const destination=path.join(studio,'.runtime/ios/codex-frozen-protocol-compat.json');await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));if(!report.processCleaned||report.error)process.exitCode=1;
}
