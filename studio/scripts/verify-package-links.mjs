import { lstat, readdir, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';

const input = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !(await lstat(input)).isDirectory()) throw new Error('Packaged app is missing');
const appRoot = await realpath(input);
let count = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await readlink(file);
      if (path.isAbsolute(target)) throw new Error(`Absolute link in packaged app: ${file} -> ${target}`);
      const resolved = await realpath(file);
      if (!resolved.startsWith(appRoot + path.sep)) throw new Error(`Link escapes packaged app: ${file} -> ${resolved}`);
      count++;
    } else if (entry.isDirectory()) await walk(file);
  }
}
await walk(appRoot);
console.log(`Verified ${count} self-contained package links.`);
