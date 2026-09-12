import { cp, mkdir, rm, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export async function packageKnowledge(studio) {
  const destination = path.join(studio, '.runtime/package/workspace-template');
  await rm(destination, {recursive:true, force:true});
  await mkdir(destination, {recursive:true});
  await cp(path.join(studio, '../AGENTS.md'), path.join(destination, 'AGENTS.md'));
  await cp(path.join(studio, '../knowledge-engine'), path.join(destination, 'knowledge-engine'), {
    recursive:true,
    filter: (source) => !['__pycache__','.DS_Store','.git'].includes(path.basename(source)) && !source.endsWith('.pyc'),
  });
  // The Web demo is the only authoritative demo dataset, including photo/bill sidecars.
  await cp(path.join(studio, '../vault/demo'), path.join(destination, 'demo'), { recursive:true, verbatimSymlinks:true, filter:source => !['.DS_Store','__pycache__'].includes(path.basename(source)) });
  // uv supplies a relocatable CPython distribution; consumers need no developer tools.
  const uv = process.env.TWH_UV || 'uv';
  function run(args) {
    const result = spawnSync(uv, args, {encoding:'utf8'});
    if (result.status !== 0) throw new Error(`Python packaging failed: ${result.stderr || result.error}`);
    return result.stdout.trim();
  }
  run(['python','install','3.12.13']);
  const binary = await realpath(run(['python','find','--managed-python','3.12.13']));
  const python = path.join(studio, '.runtime/package/python');
  await rm(python, {recursive:true, force:true});
  await cp(path.resolve(binary,'../..'), python, {recursive:true, verbatimSymlinks:true});
  run(['pip','install','--python',path.join(python,'bin/python3'),'--target',path.join(python,'lib/python3.12/site-packages'),'--no-deps','PyYAML==6.0.3']);
  const check = spawnSync(path.join(python,'bin/python3'), ['-I','-c','import yaml; print(yaml.__version__)'], {encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});
  if (check.status !== 0 || check.stdout.trim() !== '6.0.3') throw new Error('Bundled Python is not self-contained');
}
