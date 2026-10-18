import { cp, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Frontend modules are bundled into JavaScript/WASM/fonts, so their original
// license files must accompany the binary separately from runtime node_modules.
export async function packageLicenses(studio) {
  const output = path.join(studio, '.runtime/package/licenses');
  await rm(output, { recursive:true, force:true });
  await mkdir(output, { recursive:true });
  const seen = new Set();
  const entries = [];
  const fallback = {
    '@mediapipe/tasks-vision': ['MEDIAPIPE-LICENSE'],
    'onnxruntime-web': ['ONNXRUNTIME-LICENSE', 'ONNXRUNTIME-THIRD-PARTY-NOTICES.txt'],
    'onnxruntime-common': ['ONNXRUNTIME-LICENSE', 'ONNXRUNTIME-THIRD-PARTY-NOTICES.txt'],
    'guid-typescript': ['GUID-TYPESCRIPT-README.md', 'ISC-LICENSE.txt'],
  };
  async function resolve(name, from) {
    for (let dir = from;; dir = path.dirname(dir)) {
      try { return await realpath(path.join(dir, 'node_modules', name)); } catch {}
      if (path.dirname(dir) === dir) return undefined;
    }
  }
  async function visit(source) {
    if (seen.has(source)) return;
    seen.add(source);
    const manifest = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
    if (manifest.name.startsWith('@the-way-here/')) return;
    const target = path.join(output, `${manifest.name.replaceAll('/', '__')}@${manifest.version}`);
    const files = [];
    async function licenses(dir) {
      for (const entry of await readdir(dir, { withFileTypes:true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) { await licenses(file); continue; }
        if (entry.isFile() && /^(?:licen[cs]e|notice|copying|copyright|ofl)(?:[._-]|$)/i.test(entry.name)) {
          const relative = path.relative(source, file);
          await mkdir(path.dirname(path.join(target, relative)), { recursive:true });
          await cp(file, path.join(target, relative));
          files.push(relative);
        }
      }
    }
    await licenses(source);
    for (const file of fallback[manifest.name] || []) {
      await mkdir(target, { recursive:true });
      await cp(path.join(studio, 'scripts/licenses/frontend', file), path.join(target, file));
      files.push(file);
    }
    await mkdir(target, { recursive:true });
    await cp(path.join(source, 'package.json'), path.join(target, 'package.json'));
    entries.push({ name:manifest.name, version:manifest.version, license:manifest.license, files });
    for (const name of new Set([...Object.keys(manifest.dependencies || {}), ...Object.keys(manifest.optionalDependencies || {}), ...Object.keys(manifest.peerDependencies || {})])) {
      const dependency = await resolve(name, source);
      if (dependency && (await stat(dependency)).isDirectory()) await visit(dependency);
    }
  }
  const web = path.join(studio, 'apps/web');
  const manifest = JSON.parse(await readFile(path.join(web, 'package.json'), 'utf8'));
  for (const name of Object.keys(manifest.dependencies)) {
    if (name.startsWith('@the-way-here/')) continue;
    const dependency = await resolve(name, web);
    if (!dependency) throw new Error(`Missing frontend dependency ${name}`);
    await visit(dependency);
  }
  await writeFile(path.join(output, 'frontend-packages.json'), JSON.stringify(entries, null, 2));
  console.log(`Included frontend license records for ${entries.length} packages.`);
}
