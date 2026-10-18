import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const releases = [
  { name:'xz', version:'5.8.4', sha256:'0014c7886930454fe8bd4228665b51af55eeae560ea135c9c4cd33f55b2591d9', url:'https://github.com/tukaani-project/xz/releases/download/v5.8.4/xz-5.8.4.tar.gz' },
  { name:'bzip2', version:'1.0.8', sha256:'ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269', url:'https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz' },
];

// Codex arm64 upstream links Apple's non-public liblzma/libbz2 copies.
// Build and ship the public upstream libraries, retaining their API and notices.
// This changes library ownership, not symbol names or application behavior.
export async function packageCodexCompression(studio, output) {
  const cache=path.join(studio,'.runtime','mas-compression',process.arch);
  const libs=path.join(output,'lib');
  await mkdir(cache,{recursive:true}); await mkdir(libs,{recursive:true});
  const env={...process.env,MACOSX_DEPLOYMENT_TARGET:'15.0',CFLAGS:`-O2 -fPIC -arch ${process.arch==='arm64'?'arm64':'x86_64'} -mmacosx-version-min=15.0`,LDFLAGS:'-mmacosx-version-min=15.0'};
  function run(command,args,cwd=cache) {
    const r=spawnSync(command,args,{cwd,env,encoding:'utf8',maxBuffer:32*1024*1024});
    if(r.status!==0) throw new Error(`${command} failed: ${r.stderr || r.stdout || r.error}`);
    return r.stdout;
  }
  for(const release of releases) {
    const archive=path.join(cache,`${release.name}-${release.version}.tar.gz`);
    try { await access(archive); } catch { run('/usr/bin/curl',['--fail','--location','--retry','2','--connect-timeout','15','--max-time','180','--output',archive,release.url]); }
    if(createHash('sha256').update(await readFile(archive)).digest('hex')!==release.sha256) throw new Error(`Invalid ${release.name} source checksum`);
    const source=path.join(cache,`${release.name}-${release.version}`);
    try { await access(source); } catch { run('/usr/bin/tar',['-xzf',archive,'-C',cache]); }
    const license=path.join(output,'licenses',`${release.name}-${release.version}`);
    await mkdir(license,{recursive:true});
    if(release.name==='xz') {
      const dylib=path.join(source,'src/liblzma/.libs/liblzma.5.dylib');
      try { await access(dylib); } catch {
        run('./configure',['--enable-shared','--disable-static','--disable-nls','--disable-xz','--disable-xzdec','--disable-lzmadec','--disable-lzmainfo','--disable-scripts','--disable-doc'],source);
        run('/usr/bin/make',['-j4','-C','src/liblzma'],source);
      }
      await cp(dylib,path.join(libs,'liblzma.5.dylib'));
      for(const file of ['COPYING','COPYING.0BSD','COPYING.GPLv2','COPYING.GPLv3','AUTHORS']) await cp(path.join(source,file),path.join(license,file));
    } else {
      const dylib=path.join(source,'libbz2.1.0.dylib');
      try { await access(dylib); } catch {
        run('/usr/bin/clang',[...env.CFLAGS.split(' '),'-dynamiclib','-install_name','@rpath/libbz2.1.0.dylib','-compatibility_version','1.0','-current_version','1.0.8','-o',dylib,...['blocksort.c','huffman.c','crctable.c','randtable.c','compress.c','decompress.c','bzlib.c']],source);
      }
      await cp(dylib,path.join(libs,'libbz2.1.0.dylib'));
      await cp(path.join(source,'LICENSE'),path.join(license,'LICENSE'));
    }
  }
  const binary=path.join(output,'bin/codex');
  const dependencies=run('/usr/bin/otool',['-L',binary]);
  for(const name of ['liblzma.5.dylib','libbz2.1.0.dylib']) {
    const library=path.join(libs,name);
    run('/usr/bin/install_name_tool',['-id',`@rpath/${name}`,library]);
    if(dependencies.includes(`/usr/lib/${name}`)) run('/usr/bin/install_name_tool',['-change',`/usr/lib/${name}`,`@executable_path/../lib/${name}`,binary]);
  }
  if(/\/usr\/lib\/(?:liblzma|libbz2)/.test(run('/usr/bin/otool',['-L',binary]))) throw new Error('Codex still uses non-public system compression libraries');
  await writeFile(path.join(output,'compression-libraries.json'),JSON.stringify({releases,linkage:'Bundled public upstream libraries; no Apple private compression libraries',minimumSystemVersion:'15.0'},null,2));
}
