import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.join(studio,'apps/desktop/dist');
await mkdir(destination,{recursive:true});
if(process.platform !== 'darwin') throw new Error('Native desktop packaging requires macOS.');
for (const [command,args] of [['xcrun',['swiftc',path.join(studio,'apps/desktop/native/SpeechCapture.swift'),'-o',path.join(destination,'speech-capture')]]]) { const result=spawnSync(command,args,{stdio:'inherit'}); if(result.status) process.exit(result.status); }
await import('./build-brand-assets.mjs');
const iconset=path.join(destination,'app.iconset');
const result=spawnSync('iconutil',['-c','icns',iconset,'-o',path.join(destination,'app.icns')],{stdio:'inherit'}); if(result.status) process.exit(result.status);
await rm(iconset,{recursive:true});
