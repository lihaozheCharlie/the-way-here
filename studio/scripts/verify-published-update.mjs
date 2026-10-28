import { readFile, writeFile } from 'node:fs/promises';
import { downloadVerifiedRelease } from './download-verified-release.mjs';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import assert from 'node:assert/strict';
import { UpdateChecker, UPDATE_FEED_URL } from '../apps/desktop/src/updates.mjs';
const release=JSON.parse(await readFile(new URL('../.runtime/direct/release.json',import.meta.url),'utf8'));
assert.equal(release.ready,true);
const response=await fetch(UPDATE_FEED_URL,{signal:AbortSignal.timeout(20_000),cache:'no-store'});
assert.equal(response.ok,true,'Published latest-release feed is not available');
const bytes=await response.arrayBuffer(),feed=JSON.parse(Buffer.from(bytes).toString('utf8'));
assert.equal(feed.version,release.version);
assert.equal(feed.downloads[release.arch].sha256,release.sha256);
assert.equal(feed.downloads[release.arch].size,release.size);
const request=async()=>new Response(bytes);
const current=new UpdateChecker({version:release.version,arch:release.arch,systemVersion:release.minimumSystemVersion,fetch:request});
assert.equal((await current.check()).status,'current');
const older=new UpdateChecker({version:'0.0.0',arch:release.arch,systemVersion:release.minimumSystemVersion,fetch:request});
assert.equal((await older.check()).status,'available');
assert.equal(older.state.latestVersion,release.version);
assert.equal(older.downloadURL(),feed.downloads[release.arch].url);
current.dispose();older.dispose();
const downloads=[{url:feed.downloads[release.arch].url,size:release.size,algorithm:'sha256',digest:release.sha256}];
if (release.installer) {
  assert.equal(release.autoUpdateVerified,true);
  assert.deepEqual(feed.downloads[release.arch].installer,release.installer);
  const base=`https://github.com/lihaozheCharlie/the-way-here/releases/download/mac-v${release.version}/`;
  const nativeResponse=await fetch(base+'latest-mac.yml',{signal:AbortSignal.timeout(20_000),cache:'no-store'});
  assert.equal(nativeResponse.ok,true);
  const native=YAML.parse(await nativeResponse.text());
  assert.equal(native.version,release.version);
  assert.deepEqual(native.files,[{url:base+release.installer.filename,sha512:release.installer.sha512,size:release.installer.size}]);
  downloads.push({url:base+release.installer.filename,size:release.installer.size,algorithm:'sha512',digest:release.installer.sha512});
}
for (const artifact of downloads) {
  await downloadVerifiedRelease({ ...artifact, destination:fileURLToPath(new URL('../.runtime/direct/public-downloads/'+new URL(artifact.url).pathname.split('/').at(-1),import.meta.url)) });
  console.log(`Public ${artifact.algorithm==='sha512'?'ZIP':'DMG'} download size and checksum verified.`);
}
await writeFile(new URL(`../.runtime/direct/public-verification-${release.version}.json`,import.meta.url),JSON.stringify({version:release.version,feedVerified:true,nativeFeedVerified:Boolean(release.installer),publicDownloadsVerified:true,downloadCount:downloads.length},null,2));
console.log(`Published ${feed.version} feed verified: current client is up to date; simulated older checker offers the exact release download.`);
