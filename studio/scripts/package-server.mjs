import { cp, mkdir, readFile, realpath, symlink, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
// Materialize the installed production graph, preserving pnpm's separate versions.
// Package exports may hide package.json, so resolve package directories directly.
export async function packageServer(studio, destination) {
  const seen = new Map();
  const dependencyRoot = path.join(destination,'node_modules/.runtime-deps');
  await mkdir(dependencyRoot,{recursive:true});
  async function resolve(name, from) {
    let directory = from;
    while (true) {
      const candidate=path.join(directory,'node_modules',name);
      try { if ((await stat(candidate)).isDirectory()) return await realpath(candidate); } catch {}
      const parent=path.dirname(directory); if(parent===directory) return undefined; directory=parent;
    }
  }
  async function copyPackage(source) {
    if (seen.has(source)) return seen.get(source);
    const manifest=JSON.parse(await readFile(path.join(source,'package.json'),'utf8'));
    const key=createHash('sha256').update(source).digest('hex').slice(0,16);
    const target=path.join(dependencyRoot,key);
    seen.set(source,target);
    await cp(source,target,{recursive:true,filter:(file) => !path.relative(source,file).split(path.sep).includes('node_modules')});
    for (const name of new Set([...Object.keys(manifest.dependencies || {}),...Object.keys(manifest.optionalDependencies || {}),...Object.keys(manifest.peerDependencies || {})])) {
      const resolved=await resolve(name,source); if (!resolved) {
        if (manifest.dependencies?.[name] && !manifest.optionalDependencies?.[name]) throw new Error(`Missing runtime dependency ${manifest.name}: ${name}`);
        continue;
      }
      const nested=await copyPackage(resolved);
      const link=path.join(target,'node_modules',name); await mkdir(path.dirname(link),{recursive:true});
      await symlink(path.relative(path.dirname(link),nested),link);
    }
    return target;
  }
  const server=path.join(studio,'apps/server');
  const manifest=JSON.parse(await readFile(path.join(server,'package.json'),'utf8'));
  const dependencies=Object.fromEntries(Object.entries(manifest.dependencies).filter(([name])=>!name.startsWith('@the-way-here/')));
  await cp(path.join(server,'dist'),path.join(destination,'dist'),{recursive:true});
  await writeFile(path.join(destination,'package.json'),JSON.stringify({name:manifest.name,version:manifest.version,type:'module',dependencies},null,2));
  for(const name of Object.keys(dependencies)) {
    const resolved=await resolve(name,server); if(!resolved) throw new Error(`Missing ${name}`);
    const target=await copyPackage(resolved);
    const link=path.join(destination,'node_modules',name); await mkdir(path.dirname(link),{recursive:true}); await symlink(path.relative(path.dirname(link),target),link);
  }
  console.log(`Packaged ${seen.size} production dependencies; no workspace or private content included.`);
}
