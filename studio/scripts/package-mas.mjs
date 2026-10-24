import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { packageKnowledge } from './package-knowledge.mjs';
import { packageServer } from './package-server.mjs';
import { packageCodex } from './package-codex.mjs';
import { packageLicenses } from './package-licenses.mjs';
import { applyPythonAppStoreCompliance } from './python-app-store-compliance.mjs';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const build = process.argv.includes('--build');
const release = process.argv.includes('--release');
const target = release ? 'mas' : 'mas-dev';
const appId = 'com.thewayhere.desktop';
const required = ['TWH_APPLE_TEAM_ID','TWH_APPLE_PROFILE','TWH_APPLE_IDENTITY','TWH_OPERATOR','TWH_PRIVACY_URL','TWH_SUPPORT_URL','TWH_BUILD_NUMBER'];
const missing = required.filter(key => !env[key]?.trim());
if (missing.length) throw new Error(`请由账号持有人补齐：${missing.join(', ')}。未生成可提交安装包。`);
if (!/^[A-Z0-9]{10}$/.test(env.TWH_APPLE_TEAM_ID)) throw new Error('Team ID 必须是 Apple 的 10 位标识');
if (!/^[1-9]\d{0,8}$/.test(env.TWH_BUILD_NUMBER)) throw new Error('Build number 必须是递增正整数');
for (const key of ['TWH_PRIVACY_URL','TWH_SUPPORT_URL']) {
  const url = new URL(env[key]);
  if (url.protocol !== 'https:' || /localhost|example\.(com|org)|127\.0\.0\.1/.test(url.hostname)) throw new Error(`${key} 必须是已上线的 HTTPS 页面`);
}
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: studio, encoding:'utf8', stdio:capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error(`${command} 执行失败${capture ? '，请检查证书或描述文件' : ''}`);
  return result.stdout;
}
const profilePath = path.resolve(env.TWH_APPLE_PROFILE);
await access(profilePath);
const decoded = run('/usr/bin/security', ['cms','-D','-i',profilePath], true);
// Provision profiles contain dates and DER data which plutil cannot serialize to JSON.
const converted = spawnSync('python3',['-c',`import plistlib,json,sys
p=plistlib.loads(sys.stdin.buffer.read())
e=p.get('Entitlements',{})
print(json.dumps({'TeamIdentifier':p.get('TeamIdentifier',[]),'ExpirationDate':p['ExpirationDate'].isoformat(),'ProvisionedDevices':p.get('ProvisionedDevices',[]),'Entitlements':{k:e.get(k) for k in ['com.apple.application-identifier','com.apple.security.get-task-allow']}}))`],{input:decoded,encoding:'utf8'});
if (converted.status !== 0) throw new Error('无法解析 provisioning profile');
const profile = JSON.parse(converted.stdout);
const entitlements = profile.Entitlements || {};
if (!profile.TeamIdentifier?.includes(env.TWH_APPLE_TEAM_ID)) throw new Error('描述文件与 Team ID 不匹配');
if (entitlements['com.apple.application-identifier'] !== `${env.TWH_APPLE_TEAM_ID}.${appId}`) throw new Error('描述文件必须绑定 com.thewayhere.desktop，不能是通配符');
if (!(Date.parse(profile.ExpirationDate) > Date.now())) throw new Error('描述文件已过期');
// macOS development profiles can omit get-task-allow; registered devices distinguish
// them from Mac App Store distribution profiles.
if (release && (entitlements['com.apple.security.get-task-allow'] || profile.ProvisionedDevices?.length)) throw new Error('商店分发不能使用开发测试描述文件');
if (!release && !profile.ProvisionedDevices?.length) throw new Error('开发测试描述文件需要包含本机设备');
if (/^(Apple |Mac |3rd Party )/.test(env.TWH_APPLE_IDENTITY)) throw new Error('TWH_APPLE_IDENTITY 请填证书共有的持有人姓名/Team ID，不含 Apple Distribution 等前缀');
const identities = run('/usr/bin/security',['find-identity','-v','-p','codesigning'],true);
if (!identities.includes(env.TWH_APPLE_IDENTITY)) throw new Error('钥匙串中没有指定签名身份及对应私钥');
const identityLine = identities.split('\n').find(line => line.includes(env.TWH_APPLE_IDENTITY) && (release ? /3rd Party Mac Developer Application|Apple Distribution|Mac App Distribution/.test(line) : /Mac Developer:|Apple Development:/.test(line)));
const signingHash = identityLine?.match(/[A-F0-9]{40}/)?.[0];
if (!signingHash) throw new Error('没有匹配构建类型的签名证书');
const dir = path.join(studio,'.runtime',target);
await mkdir(dir,{recursive:true});
const xml = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const plist = body => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>${body}</dict></plist>\n`;
// macOS Speech authorization uses NSSpeechRecognitionUsageDescription and the
// runtime prompt. The personal-information.speech-recognition entitlement is
// rejected by App Store validation (90285); keep supported audio input access.
const keys = ['com.apple.security.app-sandbox','com.apple.security.network.client','com.apple.security.files.user-selected.read-write','com.apple.security.files.bookmarks.app-scope','com.apple.security.device.audio-input','com.apple.security.personal-information.photos-library','com.apple.security.cs.allow-jit'];
await writeFile(path.join(dir,'app.plist'),plist(keys.map(key=>`<key>${key}</key><true/>`).join('')+`<key>com.apple.security.application-groups</key><array><string>${xml(env.TWH_APPLE_TEAM_ID)}.${appId}</string></array>`));
await writeFile(path.join(dir,'inherit.plist'),plist('<key>com.apple.security.app-sandbox</key><true/><key>com.apple.security.inherit</key><true/><key>com.apple.security.cs.allow-jit</key><true/>'));
await writeFile(path.join(dir,'codex-inherit.plist'),plist('<key>com.apple.security.app-sandbox</key><true/><key>com.apple.security.inherit</key><true/>'));
await writeFile(path.join(dir,'release-metadata.json'),JSON.stringify({operator:env.TWH_OPERATOR,privacyUrl:env.TWH_PRIVACY_URL,supportUrl:env.TWH_SUPPORT_URL},null,2));
const config = YAML.parse(await readFile(path.join(studio,'electron-builder.yml'),'utf8'));
config.forceCodeSigning = true;
config.afterSign = 'scripts/sign-mas-codex.cjs';
config.extraResources.push({from:'.runtime/package/codex',to:'codex'});
config.extraResources.push({from:'.runtime/package/licenses',to:'licenses'});
config.directories.output = path.relative(studio,dir);
config.mac.target = [{target,arch:[process.arch]}];
delete config.mac.identity;
config.mac.bundleVersion = env.TWH_BUILD_NUMBER;
// The complete pinned Codex distribution includes a macOS 15 zsh resource.
// Keep its upstream resources intact and advertise a compatible MAS minimum.
config.mac.minimumSystemVersion = '15.0.0';
config.mas = { type:release ? 'distribution' : 'development', identity:env.TWH_APPLE_IDENTITY, provisioningProfile:profilePath, entitlements:path.join(dir,'app.plist'), entitlementsInherit:path.join(dir,'inherit.plist'), hardenedRuntime:false };
// Electron's signer classifies images and locale packs as binaries. They remain
// covered by the app resource seal; only executable code needs its own signature.
config.mas.signIgnore = ['\\.(?:png|jpe?g|gif|webp|ico|icns|pak|ttf|otf|woff2?)$'];
config.extraResources.push({from:path.join(dir,'release-metadata.json'),to:'release-metadata.json'});
await writeFile(path.join(dir,'builder.yml'),YAML.stringify(config));
console.log(`证书与配置预检通过：${target}/${process.arch}。尚未证明沙盒运行或审核通过。`);
if (!build) process.exit(0);
run('pnpm',['build']);
run(process.execPath,['scripts/build-desktop-native.mjs']);
await packageServer(studio,path.join(studio,'.runtime/package/server'));
await packageKnowledge(studio);
await applyPythonAppStoreCompliance(path.join(studio, '.runtime/package/python'));
await packageCodex(studio);
await packageLicenses(studio);
env.TWH_MAS_SIGNING_IDENTITY = signingHash;
env.TWH_MAS_ENTITLEMENTS = path.join(dir,'app.plist');
env.TWH_MAS_CODEX_ENTITLEMENTS = path.join(dir,'codex-inherit.plist');
run(process.execPath,['node_modules/electron-builder/out/cli/cli.js','--config',path.join(dir,'builder.yml'),'--mac',target,'--publish','never']);
const app = path.join(dir,`${target}${process.arch === 'arm64' ? '-arm64' : ''}`,'The Way Here.app');
run(process.execPath,['scripts/verify-package-links.mjs',app]);
run('/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app]);
run(process.execPath,['scripts/verify-mas-apis.mjs',app]);
const signed = run('/usr/bin/codesign',['-d','--entitlements',':-',app],true);
if (!signed.includes('com.apple.security.app-sandbox')) throw new Error('最终应用缺少沙盒 entitlement');
console.log(release ? '已构建商店签名产物。须先完成同版本 MAS 开发签名实机验收，再用 Transporter 上传 pkg。' : '已构建开发签名 MAS 应用。请完成 docs/app-store/mas-validation.md 的实机验收。');
