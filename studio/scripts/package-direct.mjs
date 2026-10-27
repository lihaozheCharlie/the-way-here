import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { packageKnowledge } from './package-knowledge.mjs';
import { packageServer } from './package-server.mjs';
import { packageLicenses } from './package-licenses.mjs';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(studio, '.runtime/direct');
const env = { ...process.env };
const prepare = process.argv.includes('--prepare');
const signOnly = process.argv.includes('--sign-only');
const build = process.argv.includes('--build') || signOnly;
if (prepare && build) throw new Error('--prepare 与 --build 不能同时使用');
if (process.platform !== 'darwin') throw new Error('官网发布包必须在 macOS 构建');
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd:studio, env, encoding:'utf8', stdio:capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error(`${command} 执行失败${capture ? `：${result.stderr || result.error || ''}` : ''}`);
  return result.stdout;
}
await mkdir(output, { recursive:true });
const config = YAML.parse(await readFile(path.join(studio, 'electron-builder.yml'), 'utf8'));
const metadata = {
  operator: env.TWH_OPERATOR || 'LiHaozhe',
  privacyUrl: env.TWH_PRIVACY_URL || 'https://the-way-here-support.finedeer64.chatgpt.site/download/privacy.html',
  supportUrl: env.TWH_SUPPORT_URL || 'https://the-way-here-support.finedeer64.chatgpt.site/download/support.html',
};
for (const key of ['privacyUrl', 'supportUrl']) {
  const url = new URL(metadata[key]);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${key} 必须是公开 HTTPS 地址`);
}
await writeFile(path.join(output, 'release-metadata.json'), JSON.stringify(metadata, null, 2));
config.directories.output = '.runtime/direct';
config.forceCodeSigning = true;
config.mac.identity = env.TWH_DEVELOPER_ID || 'Developer ID Application';
config.mac.hardenedRuntime = true;
config.mac.notarize = !signOnly;
config.mac.target = [{ target:'dmg', arch:[process.arch] }];
config.mac.entitlements = 'apps/desktop/build/entitlements.direct.plist';
config.mac.entitlementsInherit = 'apps/desktop/build/entitlements.direct.plist';
config.mac.signIgnore = ['\\.(?:png|jpe?g|gif|webp|ico|icns|pak|ttf|otf|woff2?)$'];
config.mac.artifactName = 'The-Way-Here-${version}-${arch}.dmg';
config.dmg = { ...config.dmg, sign:true };
config.extraResources.push({ from:'.runtime/package/licenses', to:'licenses' });
config.extraResources.push({ from:'.runtime/direct/release-metadata.json', to:'release-metadata.json' });
await writeFile(path.join(output, 'builder.yml'), YAML.stringify(config));
if (prepare) {
  console.log('官网签名、公证配置已准备；未构建或发布安装包。');
  process.exit(0);
}
if (build) {
  await writeFile(path.join(output, 'release.json'), JSON.stringify({ ready:false }, null, 2));
}
// Fail before expensive packaging; a MAS certificate cannot sign direct releases.
const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], true);
const candidates = identities.split('\n').filter(line => line.includes('"Developer ID Application:') && (!env.TWH_DEVELOPER_ID || line.includes(env.TWH_DEVELOPER_ID)));
if (candidates.length !== 1) throw new Error('需要唯一匹配的 Developer ID Application 证书及私钥；可用 TWH_DEVELOPER_ID 选择。商店证书不能替代。');
// electron-builder selects the Developer ID certificate type itself and rejects
// the type prefix in its identity qualifier.
config.mac.identity = candidates[0].match(/"Developer ID Application: ([^"]+)"/)?.[1];
if (!signOnly && !env.APPLE_KEYCHAIN_PROFILE?.trim()) throw new Error('请先在钥匙串配置公证凭据，再设置 APPLE_KEYCHAIN_PROFILE；不要把密码写入项目。');
// Ensure both notarytool and electron-builder use the same keychain profile.
for (const key of ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'APPLE_KEYCHAIN']) delete env[key];
if (!signOnly) run('xcrun', ['notarytool', 'history', '--keychain-profile', env.APPLE_KEYCHAIN_PROFILE, '--output-format', 'json'], true);
await writeFile(path.join(output, 'builder.yml'), YAML.stringify(config));
console.log(signOnly ? 'Developer ID 预检通过：仅生成待公证签名包，不可公开分发。' : 'Developer ID 与公证凭据预检通过。');
if (!build) process.exit(0);
run('pnpm', ['build']);
run(process.execPath, ['scripts/build-desktop-native.mjs']);
await packageServer(studio, path.join(studio, '.runtime/package/server'));
await packageKnowledge(studio);
await packageLicenses(studio);
run(process.execPath, ['node_modules/electron-builder/out/cli/cli.js', '--config', path.join(output, 'builder.yml'), '--mac', 'dmg', '--publish', 'never']);
const app = path.join(output, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'The Way Here.app');
run(process.execPath, ['scripts/verify-package-links.mjs', app]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
if (signOnly) {
  console.log(`待公证签名包已生成：${app}。未公证，未发布，下载按钮保持关闭。`);
  process.exit(0);
}
run('xcrun', ['stapler', 'validate', app]);
run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
const { version } = JSON.parse(await readFile(path.join(studio, 'apps/desktop/package.json'), 'utf8'));
const filename = `The-Way-Here-${version}-${process.arch}.dmg`;
if (!(await readdir(output)).includes(filename)) throw new Error('缺少当前版本 DMG');
const dmg = path.join(output, filename);
const notarization = JSON.parse(run('xcrun', ['notarytool', 'submit', dmg, '--keychain-profile', env.APPLE_KEYCHAIN_PROFILE, '--wait', '--output-format', 'json'], true));
await writeFile(path.join(output, 'dmg-notarization.json'), JSON.stringify(notarization, null, 2));
if (notarization.status !== 'Accepted') {
  if (notarization.id) run('xcrun', ['notarytool', 'log', notarization.id, '--keychain-profile', env.APPLE_KEYCHAIN_PROFILE, path.join(output, 'dmg-notarization-log.json')]);
  throw new Error('DMG 未通过公证，不能发布。');
}
run('xcrun', ['stapler', 'staple', dmg]);
run('xcrun', ['stapler', 'validate', dmg]);
run('/usr/sbin/spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', dmg]);
// A valid signature does not prove the app can start. Install and launch the DMG.
run(process.execPath, ['scripts/verify-installed-desktop.mjs', dmg]);
const hash = createHash('sha256');
for await (const chunk of createReadStream(dmg)) hash.update(chunk);
const sha256 = hash.digest('hex');
const minimumSystemVersion = run('/usr/bin/plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', path.join(app, 'Contents/Info.plist')], true).trim();
await writeFile(path.join(output, 'SHA256SUMS.txt'), `${sha256}  ${filename}\n`);
await writeFile(path.join(output, 'release.json'), JSON.stringify({ ready:true, startupVerified:true, version, arch:process.arch, filename, size:(await stat(dmg)).size, sha256, minimumSystemVersion, notarizationId:notarization.id }, null, 2));
console.log(`签名、公证与 Gatekeeper 校验完成：${dmg}。上传该文件后才可启用网页下载。`);
