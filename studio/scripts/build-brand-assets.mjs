import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharp = createRequire(new URL('../apps/server/package.json', import.meta.url))('sharp');
const master = await readFile(path.join(studio, 'apps/desktop/assets/app-icon.svg'), 'utf8');
const web = path.join(studio, 'apps/web/public/brand');
const desktop = path.join(studio, 'apps/desktop/dist');
await mkdir(web, { recursive: true });
await mkdir(path.join(desktop, 'app.iconset'), { recursive: true });

// Keep the supplied paths in one master; only adjust weight and framing by size.
function artwork(size, fullBleed = false) {
  const [road, book] = size <= 32 ? [11, 10] : size <= 64 ? [9, 8.5] : size <= 128 ? [7, 6.5] : [6.5, 6];
  let svg = master.replace('stroke-width="6.5"', `stroke-width="${road}"`).replace('stroke-width="6"', `stroke-width="${book}"`);
  // Open the gap at tiny sizes so the heavier book and road remain distinct.
  if (size <= 64) svg = svg.replace("M14 70 Q 50 78 86 70", "M14 73 Q 50 81 86 73");
  if (fullBleed) svg = svg.replace('viewBox="0 0 1024 1024"', 'viewBox="64 64 896 896"');
  return svg;
}
await writeFile(path.join(web, 'app-icon.svg'), artwork(28, true));
await writeFile(path.join(web, 'favicon.svg'), artwork(16, true));
const touch = artwork(180, true).replace(/rx="20[12]"/g, 'rx="0"');
await sharp(Buffer.from(touch)).resize(180, 180).png().toFile(path.join(web, 'apple-touch-icon.png'));
// ICO embeds multiple PNG representations for legacy browsers and Windows tabs.
const pngs = await Promise.all([16, 32, 48].map((size) => sharp(Buffer.from(artwork(size, true))).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((png, i) => {
  const entry = 6 + i * 16;
  header[entry] = header[entry + 1] = [16, 32, 48][i];
  header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(path.join(web, 'favicon.ico'), Buffer.concat([header, ...pngs]));
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    await sharp(Buffer.from(artwork(size))).resize(size * scale, size * scale).png()
      .toFile(path.join(desktop, 'app.iconset', `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
  }
}
await sharp(Buffer.from(master)).png().toFile(path.join(desktop, 'app-icon.png'));
const paths = master.match(/<path[^>]+\/>/g).join('\n').replace('M14 70 Q 50 78 86 70', 'M14 73 Q 50 81 86 73').replace('stroke-width="6.5"', 'stroke-width="10"').replace('stroke-width="6"', 'stroke-width="9"');
const template = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 100 100"><g fill="none" stroke="#000">${paths}</g></svg>`;
for (const scale of [1, 2]) {
  await sharp(Buffer.from(template)).resize(18 * scale, 18 * scale).png()
    .toFile(path.join(desktop, `trayTemplate${scale === 2 ? '@2x' : ''}.png`));
}
console.log('Brand assets generated for web and macOS.');
