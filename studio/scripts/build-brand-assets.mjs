import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(new URL('../apps/server/package.json', import.meta.url))('sharp');
const master = await readFile(path.join(studio, 'apps/desktop/assets/app-icon.svg'), 'utf8');
// Every color variant is derived from the supplied logo master.
const favicon = master;
const frames = await Promise.all([16, 32, 48].map(async (size) => ({
  size, png: await sharp(Buffer.from(master)).resize(size, size).png().toBuffer(),
})));
const directory = Buffer.alloc(6 + frames.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(frames.length, 4);
let offset = directory.length;
for (const [index, { size, png }] of frames.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = size;
  directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(png.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += png.length;
}
const faviconIco = Buffer.concat([directory, ...frames.map(({ png }) => png)]);
await writeFile(path.join(studio, 'apps/desktop/assets/favicon.svg'), favicon);
await writeFile(path.join(studio, 'apps/desktop/assets/favicon.ico'), faviconIco);
const web = path.join(studio, 'apps/web/public/brand');
const desktop = path.join(studio, 'apps/desktop/dist');
await mkdir(web, { recursive: true });
await mkdir(path.join(desktop, 'app.iconset'), { recursive: true });

// Web assets preserve the supplied artwork without stroke or viewBox rewriting.
await writeFile(path.join(web, 'app-icon.svg'), master);
await writeFile(path.join(web, 'favicon.svg'), favicon);
await writeFile(path.join(web, 'favicon.ico'), faviconIco);
await sharp(Buffer.from(master)).resize(180, 180).png().toFile(path.join(web, 'apple-touch-icon.png'));
// macOS icons retain a transparent 64px safe area around the supplied tile.
const inner = master.replace(/<svg[^>]*>/, '').replace('</svg>', '');
const dock = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g transform="translate(64 64) scale(.875)">${inner}</g></svg>`;
// Generate all standard macOS icon resolutions from the same artwork.
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    await sharp(Buffer.from(dock)).resize(size * scale, size * scale).png()
      .toFile(path.join(desktop, 'app.iconset', `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
  }
}
await sharp(Buffer.from(dock)).png().toFile(path.join(desktop, 'app-icon.png'));
// Menu-bar templates omit the tile. Trim transparent margins from the actual
// artwork so any replacement mark stays visible at the native 18px size.
const symbol = inner.replace(/<rect\b[^>]*\/\s*>/g, '')
  .replace(/(fill|stroke)="#[a-fA-F0-9]+"/g, '$1="#000"');
const symbolSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${symbol}</svg>`;
const trimmedSymbol = await sharp(Buffer.from(symbolSvg)).trim().png().toBuffer();
for (const scale of [1, 2]) {
  await sharp(trimmedSymbol).resize(18 * scale, 18 * scale, {
    fit: 'contain', background: '#00000000',
  }).png().toFile(path.join(desktop, `trayTemplate${scale === 2 ? '@2x' : ''}.png`));
}
console.log('Brand assets generated for web and macOS.');
