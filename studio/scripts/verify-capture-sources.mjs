import { createRequire } from 'node:module';
const sharp = createRequire(new URL('../apps/server/package.json', import.meta.url))('sharp');
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-web-check-')));
const linkedRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), 'twh-web-original-')));
const captures = path.join(studio, '.impeccable/review/capture-sources');
const sampleId = 'sources/Web 验收/浏览器样例';
const samplePath = path.join(root, 'vault/demo/sources/Web 验收/浏览器样例.md');
let server, browser, origin, stateRoot;
let serverLog = '';
const errors = [], apiFailures = [], passed = [];
const record = name => { passed.push(name); console.log(`PASS: ${name}`); };

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, 'exit');
  const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
  server.kill('SIGTERM');
  try { await exited; } finally { clearTimeout(timer); }
}

try {
  await mkdir(captures, { recursive: true });
  const filter = file => !['.runtime', '__pycache__', '.DS_Store'].includes(path.basename(file));
  await cp(path.join(studio, '../vault/demo'), path.join(root, 'vault/demo'), { recursive: true, filter });
  await cp(path.join(studio, '../knowledge-engine'), path.join(root, 'knowledge-engine'), { recursive: true, filter });
  await writeFile(path.join(root, 'AGENTS.md'), 'Anonymous browser verification workspace.');
  await writeFile(path.join(root, 'the-way-here.config.yaml'), `version: 3
defaultKnowledgeBase: demo
paths:
  skills: knowledge-engine/skills
  tools: knowledge-engine/tools
  agentInstructions: AGENTS.md
knowledgeBases:
  demo:
    name: 匿名 Web 演示
    paths:
      wiki: vault/demo/wiki
      sources: vault/demo/sources
agents:
  runtimes:
    codex:
      enabled: false
    pi:
      enabled: false
validation:
  commands: []
`);
  await mkdir(path.dirname(samplePath), { recursive: true });
  await writeFile(path.join(linkedRoot, '连接原文.md'), '# 连接原文\n\n匿名外部文件夹，仅用于浏览器验收。');
  await writeFile(samplePath, '# 浏览器样例\n\n## 原始片段\n\n仅用于匿名 Web 功能验收。\n\n## 后续记录\n\n测试资料不进入私人知识库。');
  const env = { ...process.env, THE_WAY_HERE_VAULT: root, THE_WAY_HERE_KNOWLEDGE_BASE: 'demo', THE_WAY_HERE_PORT: '0', THE_WAY_HERE_WEB_ROOT: path.join(studio, 'apps/web/dist'), TWH_APP_CACHE_ROOT: path.join(root, 'cache') };
  delete env.THE_WAY_HERE_DEV;
  delete env.THE_WAY_HERE_DESKTOP_TOKEN;
  server = spawn(process.execPath, [path.join(studio, 'apps/server/dist/index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr.on('data', data => { serverLog += data; });
  origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Web server did not become ready: ${serverLog}`)), 30000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', () => { clearTimeout(timer); reject(new Error(`Web server exited: ${serverLog}`)); });
    server.stdout.on('data', data => {
      serverLog += data;
      const ready = serverLog.match(/TWH_READY (http:\/\/127\.0\.0\.1:\d+)/);
      if (ready) { clearTimeout(timer); resolve(ready[1]); }
    });
  });
  console.log(`Verification server PID ${server.pid}, ${origin}`);
  const policy = await fetch(`${origin}/api/storage/policy`).then(response => response.json());
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  if (path.basename(policy.stateRoot) !== key || path.basename(path.dirname(policy.stateRoot)) !== 'vaults') throw new Error('Unexpected test state location');
  stateRoot = policy.stateRoot;
  browser = await chromium.launch({ headless: true, channel: 'chrome' }).catch(() => chromium.launch({ headless: true }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 400) apiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  const go = async route => { await page.goto(origin + route); await expect(page.locator('main')).toBeVisible(); };

  const picture = 'data:image/jpeg;base64,' + (await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#b6d9ed"/><circle cx="480" cy="100" r="44" fill="#ffe3a5"/><path d="M0 320 210 130 420 380 640 220V480H0" fill="#709587"/><path d="M0 380 310 280 640 400V480H0" fill="#344e41"/><text x="30" y="445" font-size="24" fill="white">Anonymous test landscape</text></svg>')).jpeg().toBuffer()).toString('base64');
  await context.addInitScript(({picture}) => {
    const state = window.__photoTest = {status:'notDetermined',mode:'results',delay:0,holdDetection:true};
    const photos = Array.from({length:55},(_,i)=>({id:`anonymous-${i}`,name:`匿名照片-${i}.HEIC`,createdAt:'2026-09-26T08:00:00Z',hasLocation:i%2===0,width:640,height:480}));
    const RealWorker = window.Worker;
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes('photo-face.worker')) return new RealWorker(url, options);
        this.onmessage=null;this.onerror=null;this.stopped=false;
      }
      postMessage(input) {
        if(state.holdDetection && input.url.includes('/photo-2/')) return;
        if(state.failDetectionOnce && input.url.includes('/photo-2/')) { state.failDetectionOnce=false;setTimeout(()=>{if(!this.stopped)this.onmessage?.({data:{error:'匿名检测失败'}});},10);return; }
        setTimeout(()=>{if(!this.stopped)this.onmessage?.({data:{boxes:[{x:.25,y:.2,width:.25,height:.3}],descriptors:[[1,...Array(127).fill(0)]]}});},10);
      }
      terminate(){this.stopped=true;}
    };
    window.desktop={platform:'darwin',photoLibraryStatus:async()=>state.status,photoLibraryFilters:async()=>({supportsAddedDate:true,albums:[{id:'trip',title:'匿名旅行'}]}),authorizePhotoLibrary:async()=>{state.status='authorized';return state.status;},searchPhotoLibrary:async input=>{await new Promise(r=>setTimeout(r,state.delay));return {photos:state.mode==='empty'?[]:input.cursor?photos.slice(36):photos.slice(0,36),nextCursor:input.cursor||state.mode==='empty'?undefined:'more',summary:'拍摄时间 · 匿名测试结果'};},photoLibraryImage:async input=>input.assetId==='anonymous-2'&&!input.network?{cloudOnly:true}:{dataUrl:picture,cloudOnly:false},exportPhotoLibrary:async()=>({dataUrl:picture,cloudOnly:false}),retainPhotoLibrary:async()=>true,cancelPhotoLibrarySearch:async()=>true,closePhotoLibrary:async()=>{},openPhotoLibrarySettings:async()=>{},onCommand:()=>()=>{},notify:async()=>{},setBadge:async()=>{},startSpeech:async()=>{},pauseSpeech:async()=>{},stopSpeech:async()=>'',onSpeechEnded:()=>()=>{},onSpeechTranscript:()=>()=>{},onSpeechLevel:()=>()=>{}};
  },{picture});
  const initialPhotoCount = (await fetch(origin+'/api/photo-memories?knowledgeBaseId=demo').then(r=>r.json())).length;
  await go('/');
  await expect(page.locator('.model-onboarding-dialog')).toBeVisible();
  await page.getByRole('button',{name:'稍后配置',exact:true}).click();
  await page.getByRole('checkbox',{name:'不再提醒我',exact:true}).check();
  await page.getByRole('button',{name:'稍后配置',exact:true}).click();
  const button=(name)=>page.getByRole('button',{name,exact:true});
  const tab=(name)=>page.getByRole('tab',{name});
  const draft=page.getByRole('textbox',{name:'此刻的记录',exact:true});
  await draft.fill('匿名随手记草稿');
  await button('接着说').click();
  await expect(tab('找照片')).toBeDisabled();
  await button('取消本段录音').click();
  await expect(draft).toHaveValue('匿名随手记草稿');
  await tab('说或写').focus();await page.keyboard.press('ArrowRight');
  await expect(tab('找照片')).toBeFocused();
  await page.evaluate(()=>{window.__photoTest.status='denied';window.dispatchEvent(new Event('focus'));});
  await expect(button('打开系统设置')).toBeVisible();
  await page.evaluate(()=>{window.__photoTest.status='notDetermined';window.dispatchEvent(new Event('focus'));});
  await button('允许访问照片库').click();
  await button('最近 30 天').click();
  await page.getByRole('searchbox',{name:'拍摄地点（可选）'}).fill('浙江杭州');
  await button('5').click();
  await page.getByRole('button',{name:'更多筛选'}).click();
  await page.locator('.photo-album-field select').selectOption('trip');
  await page.getByLabel('仅看收藏',{exact:true}).check();
  await page.getByRole('button',{name:'更多筛选'}).click();
  await expect(button('移除筛选：匿名旅行')).toBeVisible();
  await button('移除筛选：仅看收藏').click();
  await button('搜索照片').click();
  const boxes=page.getByRole('checkbox',{name:/选择照片/});
  await expect(boxes).toHaveCount(35);
  await button('下载预览').click();await expect(boxes).toHaveCount(36);
  await boxes.nth(0).click();await boxes.nth(1).click();
  await button('放大照片：匿名照片-0.HEIC').click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'取消选择',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await tab('说或写').click();await expect(draft).toHaveValue('匿名随手记草稿');
  await tab(/找照片/).click();await expect(page.getByText('已选 2 / 50 张',{exact:true})).toBeVisible();
  await page.screenshot({path:path.join(captures,'desktop-results.png'),animations:'disabled'});
  await page.screenshot({path:path.join(studio,'.impeccable/review/hero-repro.png'),animations:'disabled'});
  await page.locator('.photo-selection-bar').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(captures,'desktop-selection.png'),animations:'disabled'});
  record('source switching, draft preservation, authorization, filters, cloud download, selection and preview');
  await button('显示更多照片').click();await expect(boxes).toHaveCount(55);
  for(let i=2;i<50;i++) await boxes.nth(i).click();
  await boxes.nth(50).click({force:true});await expect(page.getByText('一条记录最多选 50 张。先取消几张，再继续选。')).toBeVisible();
  await expect(boxes.nth(50)).toHaveAttribute('aria-checked','false');
  await button('放大照片：匿名照片-50.HEIC').click();await expect(button('已达 50 张上限')).toBeDisabled();await page.keyboard.press('Escape');
  await button('清空').click();await boxes.nth(0).click();await boxes.nth(1).click();
  await page.locator('.capture-destination:visible').click();
  await page.getByRole('textbox',{name:'新文件夹名称',exact:true}).fill('匿名照片目的地');
  await button('创建文件夹').click();await button('确定').click();
  await expect(page.locator('.capture-destination:visible')).toContainText('匿名照片目的地');
  await tab('说或写').click();await expect(page.locator('.capture-destination:visible')).toContainText('随手记');await tab(/找照片/).click();
  await button('整理成照片记忆').click();await expect(page.getByRole('heading',{name:'带一段记录进来',exact:true})).toBeVisible();
  expect((await fetch(origin+'/api/photo-memories?knowledgeBaseId=demo').then(r=>r.json())).length).toBe(initialPhotoCount);
  await button('返回选照片').click();await expect(page.getByText('已选 2 / 50 张',{exact:true})).toBeVisible();
  await button('整理成照片记忆').click();await page.getByRole('textbox',{name:'这段记忆叫什么',exact:true}).fill('匿名照片流程验收');
  await page.locator('.import-modal').screenshot({path:path.join(captures,'confirm.png'),animations:'disabled'});
  await expect(page.locator('.import-summary')).toContainText('匿名照片目的地');
  await button('开始认人物').click();await expect(page.getByRole('dialog',{name:'照片记忆',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'照片里有谁？',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'填写人物',exact:true})).toBeVisible();
  await expect(page.getByText(/第 2 \/ 2 张/)).toBeVisible();
  await page.getByRole('dialog',{name:'照片记忆',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();
  await page.evaluate(()=>{window.__photoTest.holdDetection=false;window.__photoTest.failDetectionOnce=true;});
  await page.locator('.photo-memory-history summary').click();
  await page.locator('.photo-memory-history').getByRole('button',{name:/匿名照片流程验收/}).click();
  await expect(button('重试检测')).toBeVisible();await button('重试检测').click();
  await expect(page.getByRole('button',{name:'填写人物',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'填写人物',exact:true}).click();
  await expect(page.getByText('另有 1 张照片识别为同一人，选择名字后同步更新。',{exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'搜索或填写称呼',exact:true}).fill('匿名同行者');
  await page.keyboard.press('Enter');
  const photoBatch=(await fetch(origin+'/api/photo-memories?knowledgeBaseId=demo').then(r=>r.json())).find(b=>b.files[0]?.originalName.includes('匿名照片流程验收'));
  const readMemory=()=>fetch(origin+`/api/photo-memories/${photoBatch.id}?knowledgeBaseId=demo`).then(r=>r.json());
  await expect.poll(async()=>(await readMemory()).photos.map(p=>p.people[0]?.name)).toEqual(['匿名同行者','匿名同行者']);
  await page.locator('.photo-face-hit:visible').click();
  await page.getByRole('button',{name:'拖动右下角调整人物框，方向键可微调',exact:true}).press('ArrowRight');
  await expect.poll(async()=>(await readMemory()).photos[0].people[0].box.width).toBeGreaterThan(.25);
  expect((await readMemory()).photos[1].people[0].box.width).toBe(.25);
  await page.locator('.photo-capture-dialog').screenshot({path:path.join(captures,'people.png'),animations:'disabled'});
  record('closing during detection preserves grouped identity recognition; naming sync and keyboard crop edits persist');
  await button('跳过这步').click();await page.getByLabel('故事',{exact:true}).fill('这是一段匿名故事，不调用真实模型。');
  await page.locator('.photo-capture-dialog').screenshot({path:path.join(captures,'story.png'),animations:'disabled'});
  await page.getByRole('dialog',{name:'照片记忆',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();
  await boxes.nth(3).click();
  await page.locator('.capture-history-trigger').click();await page.getByText(`照片记忆 · ${initialPhotoCount+1} 段`,{exact:true}).click();
  await page.locator('.capture-history-dialog').getByRole('button',{name:/匿名照片流程验收/}).click();await expect(page.getByLabel('故事',{exact:true})).toHaveValue('这是一段匿名故事，不调用真实模型。');

  const batches = await fetch(origin+'/api/photo-memories?knowledgeBaseId=demo').then(r=>r.json());
  const imported = batches.find(b=>b.files[0]?.originalName.includes('匿名照片流程验收'));
  expect(imported.targetFolder).toBe('匿名照片目的地');
  let generated = false, built = false, finishBuild = false;
  const fakeRuns = new Map();
  let delayPendingLookups=false;
  const pendingReleases=[];
  await context.route('**/api/runs', async route => {
    if(route.request().method()!=='POST') return route.continue();
    const body=route.request().postDataJSON(),drafting=body.outputTarget?.phase==='draft';
    const run={...body,id:drafting?'anonymous-draft':'anonymous-build',status:'running',createdAt:new Date().toISOString(),events:[],changes:[],configSnapshot:{paths:{sources:'vault/demo/sources'}}};
    fakeRuns.set(run.id,run);
    if(drafting) { generated=true; expect(body.prompt).toContain('匿名线索：和朋友一起看风景'); } else built=true;
    await route.fulfill({json:run});
  });
  await context.route('**/api/runs/anonymous-*', async route => {
    if(delayPendingLookups) await new Promise(resolve=>pendingReleases.push(resolve));
    const run=fakeRuns.get(new URL(route.request().url()).pathname.split('/').at(-1));
    return route.fulfill({json:{...run,status:run.id==='anonymous-build'&&!finishBuild?'running':'completed',result:{}}});
  });
  await context.route(`**/api/photo-memories/${imported.id}?*`, async route => {
    const response=await route.fetch(),memory=await response.json();
    return route.fulfill({json:{...memory,...(generated&&!finishBuild?{draft:'模拟 AI 起草的匿名故事。'}:{}),...(finishBuild?{builtAt:new Date().toISOString()}: {})}});
  });
  await page.getByRole('textbox',{name:'照片背后的线索（可选）',exact:true}).fill('匿名线索：和朋友一起看风景');
  await page.getByRole('button',{name:'AI 帮你写',exact:true}).click();
  await expect(page.getByLabel('故事',{exact:true})).toHaveValue('模拟 AI 起草的匿名故事。');
  await page.getByLabel('故事',{exact:true}).fill('用户核对后的匿名故事。');
  await button('收进理解').click();
  await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`the-way-here:photo-draft:demo:${id}`)||'{}').pendingBuildRunId,imported.id)).toBe('anonymous-build');
  await page.getByRole('dialog',{name:'照片记忆',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();
  await page.keyboard.press('Escape');
  finishBuild=true;delayPendingLookups=true;
  await page.locator('.capture-history-trigger').click();await page.getByText(`照片记忆 · ${initialPhotoCount+1} 段`,{exact:true}).click();
  await page.locator('.capture-history-dialog').getByRole('button',{name:/匿名照片流程验收/}).click();
  await expect(page.getByRole('dialog',{name:'照片记忆',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'AI 帮你写',exact:true})).toBeDisabled();
  await expect(page.getByText('正在恢复上次任务，请稍候…',{exact:true})).toBeVisible();
  delayPendingLookups=false;pendingReleases.splice(0).forEach(resolve=>resolve());
  await expect(page.getByRole('dialog',{name:'照片记忆',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByText(/已生成生活记录「匿名照片流程验收」/)).toBeVisible();
  await expect(page.getByText('已选 1 / 50 张',{exact:true})).toBeVisible();
  await expect(boxes.nth(3)).toHaveAttribute('aria-checked','true');
  await expect(boxes.nth(0)).toHaveAttribute('aria-checked','false');
  const completedLink=page.getByRole('link',{name:'查看记录',exact:true});
  const recordId=imported.files[0].storedPath.replace('vault/demo/sources/','sources/').replace(/\.md$/,'');
  await expect(completedLink).toHaveAttribute('href','/page/'+recordId.split('/').map(encodeURIComponent).join('/'));
  expect((await fetch(origin+'/api/pages/'+recordId.split('/').map(encodeURIComponent).join('/'))).status).toBe(200);
  await page.locator('.capture-history-trigger').click();await page.getByText(`照片记忆 · ${initialPhotoCount+1} 段`,{exact:true}).click();
  await page.locator('.capture-history-dialog').getByRole('button',{name:/匿名照片流程验收/}).click();
  await expect(page.getByRole('dialog',{name:'照片记忆',exact:true})).toBeVisible();
  await expect(button('已收进理解')).toBeDisabled();
  await page.getByRole('dialog',{name:'照片记忆',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();await page.keyboard.press('Escape');
  record('explicit AI drafting, user review and completed-build feedback (simulated model results)');

  record('50 photo cap, confirmation before writing, real import, people/story and history recovery');
  await page.evaluate(()=>{window.__photoTest.mode='empty';});await button('搜索照片').click();await expect(page.getByText(/没有找到符合条件的照片/)).toBeVisible();
  await page.evaluate(()=>{window.__photoTest.mode='results';window.__photoTest.delay=800;});await button('搜索照片').click();await button('取消查找').click();await expect(button('搜索照片')).toBeEnabled();
  await page.evaluate(()=>{window.__photoTest.delay=0;});await button('搜索照片').click();await expect(boxes).toHaveCount(35);
  await page.setViewportSize({width:1024,height:1000});await page.screenshot({path:path.join(captures,'desktop-1024.png'),animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  const other=await browser.newContext({viewport:{width:1440,height:1000}}),otherPage=await other.newPage();await otherPage.goto(origin);await expect(otherPage.getByRole('tab',{name:/找照片/})).toHaveCount(0);await other.close();
  if(process.env.TWH_CAPTURE_DESIGN) {
    const reference=await browser.newPage({viewport:{width:1024,height:1000}});
    await reference.route('https://**',route=>route.fulfill({contentType:'image/jpeg',body:Buffer.from(picture.split(',')[1],'base64')}));
    await reference.goto(pathToFileURL(process.env.TWH_CAPTURE_DESIGN).href);
    await reference.locator('[data-scenario="photo-results"]').click();
    await reference.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    await reference.screenshot({path:path.join(captures,'reference.png'),animations:'disabled'});
    await reference.close();
  }
  expect(errors).toEqual([]);expect(apiFailures).toEqual([]);
  record('empty results, cancellation, compact desktop and unsupported platforms');
  console.log('Capture sources verified with anonymous fixtures. Native authorization and real AI were not invoked.');
} finally {
  const cleanup = await Promise.allSettled([browser?.close(), stopServer()]);
  if (server?.pid) { let alive = true; try { process.kill(server.pid, 0); } catch { alive = false; } if (alive) throw new Error('Verification server is still running'); }
  if (origin) { const response = await fetch(`${origin}/api/health`).catch(() => null); if (response?.ok) throw new Error('Verification port is still listening'); }
  if (stateRoot) await rm(stateRoot, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
  await rm(linkedRoot, { recursive: true, force: true });
  for (const result of cleanup) if (result.status === 'rejected') throw result.reason;
  console.log('Verification browser, server, port and anonymous state cleaned up.');
}
