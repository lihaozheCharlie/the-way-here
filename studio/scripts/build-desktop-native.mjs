import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform !== 'darwin') throw new Error('Native desktop packaging requires macOS.');
const { prepareSpeechEngine } = await import('./prepare-speech-engine.mjs');
await prepareSpeechEngine();
const destination=path.join(studio,'apps/desktop/dist');
await mkdir(destination,{recursive:true});
if(process.platform !== 'darwin') throw new Error('Native desktop packaging requires macOS.');
const architecture = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x86_64' : undefined;
if (!architecture) throw new Error(`Unsupported desktop architecture: ${process.arch}`);
for (const [source, binary] of [['SpeechCapture.swift', 'speech-capture'], ['PhotoLibrary.swift', 'photo-library']]) {
  const result = spawnSync('xcrun', ['swiftc', '-target', `${architecture}-apple-macosx13.0`, path.join(studio, 'apps/desktop/native', source), '-o', path.join(destination, binary)], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}
await import('./build-brand-assets.mjs');
const iconset=path.join(destination,'app.iconset');
const result=spawnSync('iconutil',['-c','icns',iconset,'-o',path.join(destination,'app.icns')],{stdio:'inherit'}); if(result.status) process.exit(result.status);
await rm(iconset,{recursive:true});
