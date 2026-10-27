import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// The web catalog remains the only source; production ships a data-only copy.
export async function prepareDesktopLocales(studio, destination = path.join(studio, 'apps/desktop/dist/locales')) {
  const source = await readFile(path.join(studio, 'apps/web/src/shared/i18n/en-messages.ts'), 'utf8');
  const expression = source.replace(/export const enMessages:\s*Record<string,\s*string>\s*=\s*/, 'return ').replace(/;\s*$/, '');
  const messages = new Function(expression)();
  if (!messages || Array.isArray(messages) || typeof messages !== 'object' || !Object.values(messages).every(value => typeof value === 'string')) throw new Error('Invalid English catalog');
  await mkdir(destination, { recursive:true });
  await writeFile(path.join(destination, 'en-messages.json'), JSON.stringify(messages));
}
