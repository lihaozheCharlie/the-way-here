import { createHash } from 'node:crypto';
import { access, readFile, readdir, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const statePath = (kind) => path.join(root, '.runtime', `${kind}-state.json`);
const exists = async (file) => access(file).then(() => true, () => false);
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

async function manifests() {
  const files = ['package.json'];
  for (const group of ['apps', 'packages']) {
    for (const entry of await readdir(path.join(root, group), { withFileTypes: true }).catch(() => [])) {
      const file = `${group}/${entry.name}/package.json`;
      if (entry.isDirectory() && await exists(path.join(root, file))) files.push(file);
    }
  }
  return files.sort();
}

async function fingerprint(files, extra = '') {
  const hash = createHash('sha256').update(JSON.stringify({ schema: 1, node: process.versions.node, platform: process.platform, arch: process.arch, root, extra }));
  for (const file of [...new Set(files)].sort()) {
    hash.update(file).update('\0');
    hash.update(await readFile(path.join(root, file)).catch((error) => {
      if (error.code === 'ENOENT') return '<missing>';
      throw error;
    }));
  }
  return hash.digest('hex');
}

async function dependencyFingerprint() {
  return fingerprint([...(await manifests()), 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '../.npmrc']);
}

async function dependenciesPresent() {
  for (const file of ['node_modules/.modules.yaml', 'node_modules/.pnpm/lock.yaml']) if (!await exists(path.join(root, file))) return false;
  for (const file of await manifests()) {
    const manifest = await json(path.join(root, file));
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
      const directory = path.join(root, path.dirname(file), 'node_modules', name);
      try {
        const dependency = await json(path.join(directory, 'package.json'));
        const bins = typeof dependency.bin === 'string' ? { [name.split('/').at(-1)]: dependency.bin } : dependency.bin || {};
        for (const [command, bin] of Object.entries(bins)) {
          if (!await exists(path.join(directory, bin)) || !await exists(path.join(root, path.dirname(file), 'node_modules/.bin', command))) return false;
        }
      } catch { return false; }
    }
  }
  return true;
}

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true }).catch(() => [])) {
    if (['node_modules', 'dist', '.runtime', '.git', 'artifacts', 'coverage', '.vite', '.impeccable'].includes(entry.name)) continue;
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(file));
    else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}

async function buildFingerprint() {
  return fingerprint([
    ...(await filesUnder('apps')), ...(await filesUnder('packages')), ...(await filesUnder('scripts')),
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.base.json', '.npmrc', '.env', '.env.local', '.env.production', '.env.production.local',
  ], JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('VITE_')).sort())));
}

async function outputInventory() {
  const result = {};
  for (const directory of ['apps/web/dist', 'apps/server/dist']) {
    async function walk(dir) {
      for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
        const file = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (entry.isFile()) {
          const info = await stat(path.join(root, file));
          result[file] = { size: info.size, modified: info.mtimeMs };
        }
      }
    }
    await walk(directory);
  }
  if (!result['apps/web/dist/index.html']?.size || !result['apps/server/dist/index.js']?.size) throw new Error('构建产物缺失');
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

async function save(kind, value) {
  await mkdir(path.dirname(statePath(kind)), { recursive: true });
  const temporary = `${statePath(kind)}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, statePath(kind));
}

async function main(action) {
  if (action === 'deps-check') {
    const previous = await json(statePath('deps')).catch(() => null);
    return previous?.fingerprint === await dependencyFingerprint() && await dependenciesPresent()
      && previous.lock === await fingerprint(['node_modules/.pnpm/lock.yaml']);
  }
  if (action === 'deps-save') {
    if (!await dependenciesPresent()) throw new Error('安装结束后仍缺少依赖，请检查安装输出后重试。');
    await save('deps', { fingerprint: await dependencyFingerprint(), lock: await fingerprint(['node_modules/.pnpm/lock.yaml']) });
    return true;
  }
  if (action === 'build-check') {
    const previous = await json(statePath('build')).catch(() => null);
    if (previous?.fingerprint !== await buildFingerprint()) return false;
    const outputs = await outputInventory().catch(() => null);
    return outputs !== null && JSON.stringify(outputs) === JSON.stringify(previous.outputs);
  }
  if (action === 'build-save') {
    await save('build', { fingerprint: await buildFingerprint(), outputs: await outputInventory() });
    return true;
  }
  if (action === 'invalidate') {
    await Promise.all(['deps', 'build'].map((kind) => rm(statePath(kind), { force: true })));
    return true;
  }
  if (action === 'build-invalidate') {
    await rm(statePath('build'), { force: true });
    return true;
  }
  throw new Error(`未知启动缓存操作：${action}`);
}

try { process.exitCode = await main(process.argv[2]) ? 0 : 1; }
catch (error) { console.error(`启动检查失败：${error.message}`); process.exitCode = 2; }
