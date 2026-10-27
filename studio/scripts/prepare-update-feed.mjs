import { readFile, writeFile } from 'node:fs/promises';
import { validateUpdateFeed } from '../apps/desktop/src/updates.mjs';

export async function writeUpdateFeed(release, output, notes = {}) {
  if (release.ready !== true) throw new Error('Release has not passed notarization');
  const expected = `The-Way-Here-${release.version}-${release.arch}.dmg`;
  if (release.filename !== expected) throw new Error('Unexpected release filename');
  const feed = {
    schemaVersion:1,
    version:release.version,
    notes,
    downloads:{ [release.arch]:{
      url:`https://github.com/lihaozheCharlie/the-way-here/releases/download/mac-v${release.version}/${release.filename}`,
      size:release.size, sha256:release.sha256, minimumSystemVersion:release.minimumSystemVersion,
    } },
  };
  if (!validateUpdateFeed(feed, release.arch)) throw new Error('Unsupported release architecture');
  await writeFile(output, JSON.stringify(feed, null, 2) + '\n');
  return feed;
}
export async function readReleaseNotes(env = process.env) {
  const notes = {};
  for (const [locale, key] of [['zh','TWH_RELEASE_NOTES_ZH'], ['en','TWH_RELEASE_NOTES_EN']]) {
    if (env[key]) notes[locale] = (await readFile(env[key], 'utf8')).trim();
  }
  return notes;
}
