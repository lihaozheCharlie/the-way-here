import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, realpath, readdir, readFile, rm, mkdir, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const temp = await realpath(await mkdtemp(path.join(os.tmpdir(),'twh-fresh-install-')));
const sourceApp = path.resolve('.runtime/releases/mac-arm64/The Way Here.app');
const movedApp = path.join(temp,'Applications/The Way Here.app');
await mkdir(path.dirname(movedApp),{recursive:true});
await cp(sourceApp,movedApp,{recursive:true,verbatimSymlinks:true});
const userData = path.join(temp,'new-user');
const env = {...process.env, PATH:'/usr/bin:/bin'};
delete env.THE_WAY_HERE_VAULT; delete env.THE_WAY_HERE_KNOWLEDGE_BASE;
let app;
const launch = () => electron.launch({executablePath:path.join(movedApp,'Contents/MacOS/The Way Here'),args:['--diagnostics',`--user-data-dir=${userData}`],env,timeout:60000});
try {
  app = await launch();
  const page = await app.firstWindow({timeout:60000});
  const errors = []; page.on('pageerror',error=>errors.push(error.message));
  await expect(page.getByRole('heading',{name:'从你的第一段记录开始'})).toBeVisible();
  expect(await app.evaluate(({app}) => app.getPath('userData'))).toBe(userData);
  const workspace = JSON.parse(await readFile(path.join(userData,'workspace.json'),'utf8')).root;
  expect(workspace).toBe(path.join(userData,'workspace'));
  const config = await readFile(path.join(workspace,'the-way-here.config.yaml'),'utf8');
  expect(config).toContain('app/personal/wiki');
  async function compareDemo(source, target) {
    for (const entry of await readdir(source,{withFileTypes:true})) {
      if (['.DS_Store','__pycache__'].includes(entry.name)) continue;
      const from=path.join(source,entry.name), to=path.join(target,entry.name);
      if(entry.isDirectory()) await compareDemo(from,to);
      else expect((await readFile(to)).equals(await readFile(from)),from).toBe(true);
    }
  }
  await compareDemo(path.resolve('../vault/demo'),path.join(workspace,'vault/demo'));

  const bundledPython = path.join(movedApp,'Contents/Resources/python/bin/python3');
  for (const script of ['update_obsidian_tags.py','update_obsidian_tags.py','validate_wiki_links.py','validate_skill_system.py']) {
    const check = spawnSync(bundledPython,[path.join(workspace,'knowledge-engine/tools',script)],{cwd:workspace,env:{PATH:'/usr/bin:/bin',THE_WAY_HERE_KNOWLEDGE_BASE:'personal'},encoding:'utf8'});
    console.log(script,check.stdout,check.stderr); expect(check.status).toBe(0);
  }
  await page.screenshot({path:path.resolve('.impeccable/reviews/fresh-install-welcome.png')});
  for (const route of ['/sources','/knowledge','/questions','/insights','/timeline','/letters','/relationships','/cards/personal-lines','/cards/cycles','/cards/systems','/mental-models']) {
    console.log('Empty route',route); await page.goto(new URL(route,page.url()).href); await page.locator('h1').first().waitFor();
    expect(await page.locator('.main-area').evaluate(el=>el.scrollWidth <= el.clientWidth+2)).toBe(true);
  }
  await page.locator('.desktop-sidebar a[href="/sources"]').click();
  await expect(page.locator('.context-agent-context-chip b')).toHaveText('生活记录');
  await page.locator('.desktop-sidebar a[href="/"]').click();
  await expect(page.locator('.context-agent-context-chip b')).toHaveText('一起往下想');
  await page.addInitScript(() => { const original=window.fetch.bind(window); window.fetch=(input,init) => String(input).includes('/api/search?') && localStorage.getItem('simulate-search-failure') ? Promise.resolve(new Response(JSON.stringify({error:'暂时无法搜索，请重试'}),{status:503,headers:{'Content-Type':'application/json'}})) : original(input,init); });
  await page.evaluate(()=>localStorage.setItem('simulate-search-failure','true')); 
  await page.goto(new URL('/search?q=test',page.url()).href);
  await expect(page.locator('.main-area')).toContainText('暂时无法搜索');
  await page.evaluate(()=>localStorage.removeItem('simulate-search-failure'));
  await page.reload(); await expect(page.locator('.main-area')).toContainText('没有找到相关内容');
  await page.goto(new URL('/',page.url()).href);
  const settingsPromise=app.waitForEvent('window'); await page.getByRole('button',{name:'设置 AI 助手',exact:true}).click();
  const settings=await settingsPromise; await expect(settings.getByRole('tab',{name:'AI 助手'})).toHaveAttribute('aria-selected','true'); await settings.close();
  const capturePromise=app.waitForEvent('window'); await page.getByRole('button',{name:'写下第一段记录'}).click();
  const capture=await capturePromise;
  await capture.getByRole('textbox',{name:'记录标题（可选）'}).fill('首次安装记录');
  await capture.getByRole('textbox',{name:'随手记内容'}).fill('没有源码、没有额外配置，也能保留这一段。');
  await capture.getByRole('button',{name:'保存记录',exact:true}).click(); await expect(capture.getByRole('status')).toContainText('已保存');
  const origin=new URL(page.url()).origin;
  await page.evaluate(()=>localStorage.setItem('first-install-check','saved'));
  await app.close(); app=undefined;
  await rm(movedApp,{recursive:true}); await cp(sourceApp,movedApp,{recursive:true,verbatimSymlinks:true});
  app=await launch(); const reopened=await app.firstWindow({timeout:60000});
  await expect(reopened.locator('h1')).toContainText('欢迎回来');
  expect(new URL(reopened.url()).origin).toBe(origin);
  expect(await reopened.evaluate(()=>localStorage.getItem('first-install-check'))).toBe('saved');
  expect(await reopened.evaluate(()=>fetch('/api/search?q=没有源码').then(r=>r.json()).then(r=>r.length))).toBe(1);
  expect(await readFile(path.join(workspace,'the-way-here.config.yaml'),'utf8')).toBe(config);
  await reopened.locator('.global-kb-trigger').click();
  await reopened.getByRole('menuitemradio',{name:/The Way Here 演示 Wiki/}).click();
  await expect(reopened.locator('.global-kb-trigger')).toContainText('The Way Here 演示 Wiki');
  await expect(reopened.locator('h1')).toContainText('欢迎回来');
  const demo = await reopened.evaluate(()=>fetch('/api/vault').then(r=>r.json()));
  expect(demo.knowledgeBaseId).toBe('demo'); expect(demo.pageCount).toBeGreaterThan(0); expect(demo.sourceCount).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  console.log('PASS: relocated installed app; no supplied workspace; automatic library, all empty routes, bundled quality gates, AI settings, capture, application replacement, stable storage and records.');
} catch (error) { const page=app?.windows()[0]; if(page) console.log('Failed page',page.url(),await page.locator('body').innerText()); throw error; } finally { await app?.close(); await rm(temp,{recursive:true,force:true}); }
