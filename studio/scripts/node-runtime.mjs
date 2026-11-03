import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, lstat, rm, rename, copyFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NODE_RUNTIME = Object.freeze(JSON.parse(await readFile(new URL('./node-runtime-manifest.json', import.meta.url), 'utf8')));
const insist = (condition, message) => { if (!condition) throw new Error(message); };
const digest = data => createHash('sha256').update(data).digest('hex');
export function nodeRuntimeBuildPlan({ arch = process.arch, platform = process.platform } = {}) {
  insist(platform === 'darwin' || platform === 'mas', 'Bundled Node supports macOS only.');
  arch = arch === 3 ? 'arm64' : arch === 1 || arch === 'x86_64' ? 'x64' : arch;
  insist(['arm64', 'x64'].includes(arch), 'Bundled Node requires an explicit arm64 or x64 architecture.');
  const archive = NODE_RUNTIME.archives[arch];
  return { version: NODE_RUNTIME.version, releaseDate: NODE_RUNTIME.releaseDate, lts: NODE_RUNTIME.lts, minimumMacOS: NODE_RUNTIME.minimumMacOS, arch,
    filename: archive.filename, sha256: archive.sha256, url: NODE_RUNTIME.source + archive.filename,
    checksumsURL: NODE_RUNTIME.checksums, cacheRelativePath: `.runtime/cache/node/${NODE_RUNTIME.version}/${arch}`,
    outputRelativePath: `.runtime/package/node/${arch}`, executableRelativePath: 'bin/node',
    packagedRelativePath: 'node/bin/node', files: ['bin/node', 'LICENSE', 'runtime.json'] };
}
export function verifyNodeArchive(bytes, checksums, plan) {
  const entries = checksums.split(/\r?\n/).flatMap(line => { const match = line.match(/^([a-f0-9]{64})\s+\*?([^\s]+)$/); return match && match[2] === plan.filename ? [match[1]] : []; });
  insist(entries.length === 1 && entries[0] === plan.sha256, 'Official Node checksum entry differs from the pinned release.');
  insist(digest(bytes) === plan.sha256, 'Node archive checksum mismatch.');
}
async function noSymlinkParents(target) {
  let current = path.resolve(target);
  while (true) {
    const entry = await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    insist(!entry?.isSymbolicLink(), 'Node runtime paths must not contain symbolic links.');
    const parent = path.dirname(current); if (parent === current) return; current = parent;
  }
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { maxBuffer: 160 * 1024 * 1024, ...options });
  insist(result.status === 0, `Node preparation command failed: ${command}: ${result.error?.message || result.stderr?.toString() || result.status}`);
  return result.stdout;
}
function download(url, target) {
  // Both URLs originate exclusively in the checked-in official release manifest.
  run('/usr/bin/curl', ['--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--tlsv1.2', '--connect-timeout', '20', '--max-time', '180', '--silent', '--show-error', '--output', target, url]);
}
export async function prepareNodeRuntime({ studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), arch = process.arch, platform = process.platform } = {}) {
  const plan = nodeRuntimeBuildPlan({ arch, platform });
  const cache = path.join(studio, plan.cacheRelativePath), output = path.join(studio, plan.outputRelativePath);
  await noSymlinkParents(cache); await noSymlinkParents(output);
  await mkdir(cache, { recursive: true }); await mkdir(path.dirname(output), { recursive: true });
  const checksumPath = path.join(cache, 'SHASUMS256.txt'), archivePath = path.join(cache, plan.filename);
  for (const [url, target] of [[plan.checksumsURL, checksumPath], [plan.url, archivePath]]) {
    await noSymlinkParents(target);
    if (!(await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; }))) {
      const temporary = await mkdtemp(path.join(cache, '.download-'));
      try { const file = path.join(temporary, 'download'); download(url, file); await rename(file, target); }
      finally { await rm(temporary, { recursive: true, force: true }); }
    }
  }
  verifyNodeArchive(await readFile(archivePath), await readFile(checksumPath, 'utf8'), plan);
  const staging = await mkdtemp(path.join(path.dirname(output), '.node-'));
  try {
    const prefix = `node-v${plan.version}-darwin-${plan.arch}`;
    // Extract exact regular-file payloads to stdout; never unpack archive directories,
    // symlinks, npm, headers, or arbitrary archive paths into the application.
    const binary = run('/usr/bin/tar', ['-xOf', archivePath, `${prefix}/bin/node`]);
    const license = run('/usr/bin/tar', ['-xOf', archivePath, `${prefix}/LICENSE`]);
    insist(binary.length > 1024 * 1024 && license.toString('utf8').includes('Node.js'), 'Official Node payload or license is missing.');
    await mkdir(path.join(staging, 'bin')); await writeFile(path.join(staging, 'bin/node'), binary, { mode: 0o755 });
    await writeFile(path.join(staging, 'LICENSE'), license);
    const architectures = run('/usr/bin/lipo', ['-archs', path.join(staging, 'bin/node')], { encoding: 'utf8' }).trim();
    insist(architectures === (plan.arch === 'x64' ? 'x86_64' : 'arm64'), 'Node Mach-O architecture does not match its build plan.');
    const metadata = { ...plan, unsignedExecutableSHA256: digest(binary), licenseSHA256: digest(license) };
    await writeFile(path.join(staging, 'runtime.json'), JSON.stringify(metadata, null, 2) + '\n');
    await rm(output, { recursive: true, force: true }); await rename(staging, output);
    return { plan, directory: output, executable: path.join(output, 'bin/node'), metadata };
  } finally { await rm(staging, { recursive: true, force: true }); }
}
export async function preparePackagedNode(context) {
  const prepared = await prepareNodeRuntime({ studio: context.packager.projectDir, arch: context.arch, platform: context.electronPlatformName });
  const resources = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents/Resources');
  const target = path.join(resources, 'node'); await noSymlinkParents(target);
  await rm(target, { recursive: true, force: true });
  await mkdir(path.join(target, 'bin'), { recursive: true });
  for (const file of prepared.plan.files) { const destination = path.join(target, file); await noSymlinkParents(destination); await copyFile(path.join(prepared.directory, file), destination); }
  await chmod(path.join(target, 'bin/node'), 0o755);
  return path.join(target, 'bin/node');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--arch');
  const options = { arch: index < 0 ? process.arch : process.argv[index + 1] };
  if (process.argv.includes('--plan')) console.log(JSON.stringify(nodeRuntimeBuildPlan(options), null, 2));
  else { const result = await prepareNodeRuntime(options); console.log(JSON.stringify({ directory: result.directory, version: result.plan.version, arch: result.plan.arch })); }
}
