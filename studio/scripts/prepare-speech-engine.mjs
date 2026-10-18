import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access, cp, rename, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const revision = '4979e04f5dcaccb36057e059bbaed8a2f5288315'; // whisper.cpp v1.8.2
const models = [
  ['ggml-large-v3-q5_0.bin', 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-q5_0.bin', 'd75795ecff3f83b5faa89d1900604ad8c780abd5739fae406de19f23ecd98ad1'],
  ['ggml-silero-v5.1.2.bin', 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin', '29940d98d42b91fbd05ce489f3ecf7c72f0a42f027e4875919a28fb4c04ea2cf'],
];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: studio, stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`Speech engine build failed: ${command}`);
  return result.stdout;
}
async function exists(file) { try { await access(file); return true; } catch { return false; } }
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

export async function prepareSpeechEngine() {
  const source = path.join(studio, '.runtime/whisper.cpp');
  const destination = path.join(studio, 'apps/desktop/dist/speech-engine');
  const cache = path.join(studio, '.runtime/speech-models');
  await mkdir(destination, { recursive: true }); await mkdir(cache, { recursive: true });
  const stamp = path.join(destination, 'engine.json');
  let built;
  try { built = JSON.parse(await readFile(stamp, 'utf8')); } catch {}
  if (built?.revision !== revision || built?.arch !== process.arch || !await exists(path.join(destination, 'whisper-cli'))) {
    if (!await exists(path.join(source, 'CMakeLists.txt'))) {
      run('git', ['clone', '--depth', '1', '--branch', 'v1.8.2', 'https://github.com/ggml-org/whisper.cpp.git', source]);
    }
    const head = run('git', ['-C', source, 'rev-parse', 'HEAD'], { stdio: 'pipe', encoding: 'utf8' }).trim();
    if (head !== revision) throw new Error('Unexpected whisper.cpp source revision');
    const nativeCmake = spawnSync('cmake', ['--version'], { stdio: 'ignore' }).status === 0;
    const cmake = nativeCmake ? ['cmake', []] : ['uv', ['tool', 'run', '--from', 'cmake==4.4.4', 'cmake']];
    const build = path.join(source, 'build');
    run(cmake[0], [...cmake[1], '-S', source, '-B', build, '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DGGML_METAL_EMBED_LIBRARY=ON', '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_SERVER=OFF', `-DCMAKE_OSX_ARCHITECTURES=${process.arch === 'arm64' ? 'arm64' : 'x86_64'}`, '-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0']);
    run(cmake[0], [...cmake[1], '--build', build, '--target', 'whisper-cli', '--config', 'Release', '-j', '4']);
    await cp(path.join(build, 'bin/whisper-cli'), path.join(destination, 'whisper-cli'));
    await cp(path.join(source, 'LICENSE'), path.join(destination, 'LICENSE.whisper.cpp'));
  }
  for (const [name, url, expected] of models) {
    const output = path.join(destination, name);
    if (await exists(output) && await hash(output) === expected) continue;
    const cached = path.join(cache, name);
    if (!await exists(cached) || await hash(cached) !== expected) {
      const temporary = `${cached}.download`;
      try {
        const response = await fetch(url);
        if (!response.ok || !response.body) throw new Error(`Model download failed: ${name}`);
        await pipeline(response.body, createWriteStream(temporary));
        if (await hash(temporary) !== expected) throw new Error(`Model checksum mismatch: ${name}`);
        await rename(temporary, cached);
      } finally { await rm(temporary, { force: true }); }
    }
    await cp(cached, output);
  }
  await rm(path.join(destination, 'ggml-large-v3-turbo-q5_0.bin'), { force: true });
  for (const name of ['WHISPER-MODEL-LICENSE', 'SILERO-VAD-LICENSE']) await cp(path.join(studio, 'scripts/licenses/speech', name), path.join(destination, name));
  await writeFile(stamp, JSON.stringify({ revision, arch: process.arch, model: 'large-v3-q5_0', models: models.map(([file, , sha256]) => ({ file, sha256 })) }, null, 2));
  console.log('Local Whisper speech engine ready. Audio stays on this Mac.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareSpeechEngine();
