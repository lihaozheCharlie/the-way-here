import { readFile, mkdir, cp, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(studio, '.runtime/direct-site/dist');
const urlValue = process.env.TWH_DOWNLOAD_URL;
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let slot = '<p class="pending" role="status">Mac 版正在准备，暂未开放下载</p><p id="details">正式安装包就绪后，这里会提供下载入口。</p>';
if (urlValue) {
  const url = new URL(urlValue);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('下载地址必须为不含凭据的公开 HTTPS 地址');
  const release = JSON.parse(await readFile(path.join(studio, '.runtime/direct/release.json'), 'utf8'));
  if (release.ready !== true || release.startupVerified !== true || !['arm64','x64'].includes(release.arch) || !/^[a-f0-9]{64}$/.test(release.sha256)) throw new Error('正式发布记录或安装启动验证未通过，拒绝启用下载按钮');
  if (path.basename(release.filename) !== release.filename || !release.filename.endsWith('.dmg')) throw new Error('安装包文件名无效');
  const artifact = path.join(studio, '.runtime/direct', release.filename);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(artifact)) hash.update(chunk);
  if (hash.digest('hex') !== release.sha256) throw new Error('安装包已改变，请重新完成签名、公证流程');
  for (const [command, args] of [
    ['xcrun', ['stapler','validate',artifact]],
    ['/usr/sbin/spctl', ['--assess','--type','open','--context','context:primary-signature',artifact]],
  ]) {
    const result = spawnSync(command,args,{stdio:'inherit'});
    if (result.status !== 0) throw new Error('安装包安全验证失败');
  }
  // Verify the exact hosted bytes, rather than enabling a button to an old build.
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error('下载地址尚不可用');
  const hostedHash = createHash('sha256');
  const downloadDirectory = path.join(studio, '.runtime/direct-site/downloads');
  await mkdir(downloadDirectory, { recursive:true });
  const downloaded = path.join(downloadDirectory, release.filename);
  const partial = downloaded + '.part';
  await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, done) { hostedHash.update(chunk); done(null, chunk); } }), createWriteStream(partial, { mode:0o600 }));
  if (hostedHash.digest('hex') !== release.sha256) { await rm(partial, { force:true }); throw new Error('线上安装包与已公证文件不一致'); }
  await rename(partial, downloaded);
  const installed = spawnSync(process.execPath, ['scripts/verify-installed-desktop.mjs', downloaded], { cwd:studio, stdio:'inherit' });
  if (installed.status !== 0) throw new Error('线上安装包实际安装或启动失败，拒绝启用下载按钮');
  const chip = release.arch === 'arm64' ? 'Apple Silicon' : 'Intel';
  const system = /^\d+(?:\.\d+){0,2}$/.test(release.minimumSystemVersion || '') ? ` · macOS ${escape(release.minimumSystemVersion)} 或更新版本` : '';
  slot = `<a id="download" href="${escape(url.href)}">下载 Mac 版 · ${chip}</a><p id="details">版本 ${escape(release.version)}${system} · ${Math.ceil(release.size / 1000 / 1000)} MB</p>`;
}
await mkdir(destination,{recursive:true});
await cp(path.join(studio,'docs/direct-download/site'),destination,{recursive:true});
const source = await readFile(path.join(destination,'index.html'),'utf8');
await writeFile(path.join(destination,'index.html'),source.replace('<!-- RELEASE_SLOT -->',slot));
console.log(`${urlValue ? '已验证线上文件并启用下载' : '已准备待发布预览，下载按钮尚未启用'}：${destination}`);
