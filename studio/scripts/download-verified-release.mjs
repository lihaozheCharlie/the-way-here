import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, stat, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Versioned release URLs are immutable; a resumed download is still accepted
// only after checking the full file's expected size and cryptographic digest.
export async function downloadVerifiedRelease({ url, destination, size, algorithm, digest }) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Expected public HTTPS release URL');
  if (!Number.isSafeInteger(size) || size <= 0 || !['sha256','sha512'].includes(algorithm)) throw new Error('Invalid artifact metadata');
  await mkdir(path.dirname(destination), { recursive:true });
  const partial = destination + '.part';
  async function matches(file) {
    const info = await stat(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!info) return false;
    if (info.size > size) throw new Error('Downloaded artifact exceeds expected size');
    if (info.size !== size) return false;
    const hash = createHash(algorithm);
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (hash.digest(algorithm === 'sha512' ? 'base64' : 'hex') !== digest) throw new Error('Downloaded artifact checksum mismatch');
    return true;
  }
  if (await matches(destination)) return destination;
  for (let attempt=1; attempt<=5; attempt++) {
    if (await matches(partial)) { await rename(partial,destination); return destination; }
    console.log(`Downloading ${path.basename(destination)} (attempt ${attempt}, resumes partial bytes).`);
    const code = await new Promise((resolve,reject) => {
      const child=spawn('curl',['--silent','--show-error','--fail','--proto','=https','--proto-redir','=https','--location','--connect-timeout','30','--max-time','1800','--continue-at','-','--output',partial,url],{stdio:'inherit'});
      child.on('error',reject); child.on('close',resolve);
    });
    if (await matches(partial)) { await rename(partial,destination); return destination; }
    if (code === 0) throw new Error('Downloaded artifact size mismatch');
  }
  throw new Error('Public release download failed after five attempts; partial bytes preserved');
}
