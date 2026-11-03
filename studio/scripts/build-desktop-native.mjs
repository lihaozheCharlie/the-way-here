import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareDesktopLocales } from './prepare-desktop-locales.mjs';
import { buildMobileKeychainBundle } from './mobile-keychain-bundle.mjs';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform !== 'darwin') throw new Error('Native desktop packaging requires macOS.');
const destination=path.join(studio,'apps/desktop/dist');
await mkdir(destination,{recursive:true});
await prepareDesktopLocales(studio);
if(process.platform !== 'darwin') throw new Error('Native desktop packaging requires macOS.');
const architecture = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x86_64' : undefined;
if (!architecture) throw new Error(`Unsupported desktop architecture: ${process.arch}`);
for (const [source, binary] of [['SpeechCapture.swift', 'speech-capture'], ['PhotoLibrary.swift', 'photo-library'], ['MobileKeychain.swift', 'mobile-keychain']]) {
  const result = spawnSync('xcrun', ['swiftc', '-module-cache-path', path.join(studio, '.runtime/native-module-cache'), '-target', `${architecture}-apple-macosx13.0`, path.join(studio, 'apps/desktop/native', source), '-o', path.join(destination, binary)], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}
const mobileKeychain=await buildMobileKeychainBundle({studioRoot:studio});
console.log(mobileKeychain.enabled ? 'Built profile-authorized nested MobileKeychain.app; final parent signature still requires verification.' : 'Shared Keychain bundle is not configured; the bare helper remains unavailable.');
await import('./build-brand-assets.mjs');
const iconset=path.join(destination,'app.iconset');
const result=spawnSync('iconutil',['-c','icns',iconset,'-o',path.join(destination,'app.icns')],{stdio:'inherit'}); if(result.status) process.exit(result.status);
await rm(iconset,{recursive:true});
