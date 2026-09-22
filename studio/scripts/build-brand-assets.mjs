import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(new URL('../apps/server/package.json', import.meta.url))('sharp');
const master = await readFile(path.join(studio, 'apps/desktop/assets/app-icon.svg'), 'utf8');
const favicon = await readFile(path.join(studio, 'apps/desktop/assets/favicon.svg'), 'utf8');
const faviconIco = await readFile(path.join(studio, 'apps/desktop/assets/favicon.ico'));
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
// Preserve the separately supplied favicon artwork, including its 16/32/48px ICO frames.
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    await sharp(Buffer.from(dock)).resize(size * scale, size * scale).png()
      .toFile(path.join(desktop, 'app.iconset', `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
  }
}
await sharp(Buffer.from(dock)).png().toFile(path.join(desktop, 'app-icon.png'));
// A mask preserves the spine as transparent negative space in the monochrome tray.
const book = master.match(/<g\b[^>]*>([\s\S]*?)<\/g>/)?.[1];
if (!book) throw new Error('Brand master must contain the book artwork group.');
const silhouette = book.replace(/fill="#[a-fA-F0-9]+"/g, 'fill="#fff"').replace(/stroke="#[a-fA-F0-9]+"/g, 'stroke="#000"');
const template = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="-46 -48 92 72"><defs><mask id="book" maskUnits="userSpaceOnUse" x="-46" y="-48" width="92" height="72">${silhouette}</mask></defs><rect x="-46" y="-48" width="92" height="72" fill="#000" mask="url(#book)"/></svg>`;
for (const scale of [1, 2]) {
  await sharp(Buffer.from(template)).resize(18 * scale, 18 * scale).png()
    .toFile(path.join(desktop, `trayTemplate${scale === 2 ? '@2x' : ''}.png`));
}
console.log('Brand assets generated for web and macOS.');
