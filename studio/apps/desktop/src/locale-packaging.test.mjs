import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, mkdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareDesktopLocales } from '../../../scripts/prepare-desktop-locales.mjs';
const studio=fileURLToPath(new URL('../../../',import.meta.url));
test('packaged locale boots without web source files and retains native English menus and interpolation',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'twh-packaged-locale-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const resources=path.join(root,'Resources'),src=path.join(resources,'app.asar/src');
  await mkdir(src,{recursive:true});
  await cp(new URL('./locale.mjs',import.meta.url),path.join(src,'locale.mjs'));
  await prepareDesktopLocales(studio,path.join(resources,'locales'));
  const result=spawnSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    process.resourcesPath=${JSON.stringify(resources)};
    process.defaultApp=false;
    const locale=await import(${JSON.stringify(pathToFileURL(path.join(src,'locale.mjs')).href)});
    locale.setLocale('en');
    assert.equal(locale.t('偏好设置…'),'Preferences…');
    assert.equal(locale.t('发现新版本 \${version}',{version:'0.1.5'}),'Version 0.1.5 is available');
    locale.setLocale('zh');assert.equal(locale.t('偏好设置…'),'偏好设置…');
  `],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const catalog=JSON.parse(await readFile(path.join(resources,'locales/en-messages.json'),'utf8'));
  assert.ok(Object.keys(catalog).length>1000);
});
