import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Serve packaged UI files directly; neither static hosting nor API uses a port. */
export async function assetResponse(request, webRoot, fetchFile) {
  if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405});
  const root=await realpath(webRoot);
  let relative;
  try { relative=decodeURIComponent(new URL(request.url).pathname); } catch { return new Response(null,{status:400}); }
  if (relative.includes('\\') || relative.includes('\0')) return new Response(null,{status:400});
  let file=path.resolve(root,`.${relative}`);
  const inside = value => value===root || value.startsWith(root+path.sep);
  if (!inside(file)) return new Response(null,{status:403});
  try {
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    file=await realpath(file);
  } catch {
    if (path.extname(relative)) return new Response(null,{status:404});
    file=await realpath(path.join(root,'index.html'));
  }
  if (!inside(file)) return new Response(null,{status:403});
  const response=await fetchFile(pathToFileURL(file).href);
  if (request.method==='HEAD') { await response.body?.cancel(); return new Response(null,{status:response.status,headers:response.headers}); }
  return response;
}
