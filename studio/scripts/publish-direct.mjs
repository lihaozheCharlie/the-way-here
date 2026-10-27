// Publish only the exact signed/notarized bytes in release.json. No credentials in files.
import { readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compareVersions } from '../apps/desktop/src/updates.mjs';
import { writeUpdateFeed, readReleaseNotes } from './prepare-update-feed.mjs';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(studio, '.runtime/direct');
const release = JSON.parse(await readFile(path.join(output, 'release.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(studio, 'apps/desktop/package.json'), 'utf8'));
if (!release.ready || !release.startupVerified || release.version !== manifest.version || path.basename(release.filename) !== release.filename) throw new Error('Build, notarize and verify startup of the current version first');
const artifact = path.join(output, release.filename);
const hash = createHash('sha256'); for await (const chunk of createReadStream(artifact)) hash.update(chunk);
if (hash.digest('hex') !== release.sha256) throw new Error('Artifact changed after notarization');
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd:studio, encoding:'utf8', stdio:capture ? 'pipe' : 'inherit', env:process.env });
  if (result.status !== 0) throw new Error(`${command} failed${capture ? ': ' + result.stderr : ''}`);
  return result.stdout;
}
run('xcrun', ['stapler','validate',artifact]);
run('/usr/sbin/spctl', ['--assess','--type','open','--context','context:primary-signature',artifact]);
const notes = await readReleaseNotes();
if (!notes.zh && !notes.en) throw new Error('Set TWH_RELEASE_NOTES_ZH or TWH_RELEASE_NOTES_EN to a release-notes file');
const feed = await writeUpdateFeed(release, path.join(output, 'update.json'), notes);
await writeFile(path.join(output, 'SHA256SUMS.txt'), `${release.sha256}  ${release.filename}\n`);
const notePath = path.join(output, 'release-notes.md');
await writeFile(notePath, [notes.zh, notes.en, `macOS ${release.minimumSystemVersion}+ · ${release.arch} · ${Math.ceil(release.size / 1_000_000)} MB`, `SHA-256: ${release.sha256}`].filter(Boolean).join('\n\n'));
const repo = 'lihaozheCharlie/the-way-here', tag = `mac-v${release.version}`;
const previous = JSON.parse(run('gh', ['release','view','--repo',repo,'--json','tagName'], true));
if (!/^mac-v/.test(previous.tagName) || compareVersions(release.version, previous.tagName.slice(5)) <= 0) throw new Error('The release version must be newer than the current public version');
const probe = spawnSync('gh', ['release','view',tag,'--repo',repo,'--json','isDraft'], { cwd:studio, encoding:'utf8' });
if (probe.status === 0) {
  if (!JSON.parse(probe.stdout).isDraft) throw new Error('This version is already public; increment the version before publishing');
  run('gh', ['release','upload',tag,artifact,path.join(output,'SHA256SUMS.txt'),path.join(output,'update.json'),'--clobber','--repo',repo]);
} else {
  if (!/release not found|HTTP 404/.test(probe.stderr)) throw new Error('Cannot determine release state; check GitHub login/network');
  run('gh', ['release','create',tag,artifact,path.join(output,'SHA256SUMS.txt'),path.join(output,'update.json'),'--repo',repo,'--title',`The Way Here ${release.version}`,'--notes-file',notePath,'--draft']);
}
const hosted = JSON.parse(run('gh', ['release','view',tag,'--repo',repo,'--json','assets,isDraft'], true));
const dmg = hosted.assets.find(asset => asset.name === release.filename);
const expectedFeed = createHash('sha256').update(await readFile(path.join(output,'update.json'))).digest('hex');
const remoteFeed = hosted.assets.find(asset => asset.name === 'update.json');
if (!hosted.isDraft || dmg?.size !== release.size || dmg?.digest !== `sha256:${release.sha256}` || remoteFeed?.digest !== `sha256:${expectedFeed}`) throw new Error('Uploaded artifact/feed verification failed; draft remains unpublished');
run('gh', ['release','edit',tag,'--repo',repo,'--draft=false','--latest','--notes-file',notePath]);
console.log(`Published ${feed.version}. Installed clients check the fixed latest-release update.json address.`);
