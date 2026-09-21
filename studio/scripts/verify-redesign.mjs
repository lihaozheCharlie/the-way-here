import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'twh-redesign-check-')));
const linkedDirectory=await realpath(await mkdtemp(path.join(os.tmpdir(),'twh-original-check-')));
await writeFile(path.join(linkedDirectory,'连接原文.md'),'只保留在原目录的第一版');
const captures=path.join(studio,'.impeccable/reviews/redesign'); await mkdir(captures,{recursive:true});
await cp(path.join(studio,'../vault/demo'),path.join(root,'vault/demo'),{recursive:true});
await writeFile(path.join(root,'vault/demo/sources/UX 阅读验收.md'),'---\ntype: 日记\ntags: [生活, 回忆, 记录]\ndate: 2026-09-12\n---\n# UX 阅读验收\n\n## 当时的场景\n匿名原始记录，用于检验编辑与属性。\n\n## 后来想到\n还可以继续补充。\n\n### 具体线索\n完整保留原话。');
await cp(path.join(studio,'../knowledge-engine'),path.join(root,'knowledge-engine'),{recursive:true});
await writeFile(path.join(root,'AGENTS.md'),'Anonymous desktop verification workspace.');
await writeFile(path.join(root,'the-way-here.config.yaml'),'version: 3\ndefaultKnowledgeBase: demo\npaths:\n  skills: knowledge-engine/skills\n  tools: knowledge-engine/tools\n  agentInstructions: AGENTS.md\nknowledgeBases:\n  demo:\n    name: The Way Here 演示 Wiki\n    paths:\n      wiki: vault/demo/wiki\n      sources: vault/demo/sources\nagents:\n  runtimes:\n    codex:\n      enabled: false\n    pi:\n      enabled: false\nvalidation:\n  commands: []\n');
let application;
const errors=[];
try {
  application=await electron.launch({args:[path.join(studio,'apps/desktop'),'--diagnostics'],env:{...process.env,THE_WAY_HERE_VAULT:root,THE_WAY_HERE_KNOWLEDGE_BASE:'demo'},timeout:60000});
  const page=await application.firstWindow({timeout:60000});
  page.on('pageerror', error=>errors.push(error.message));
  await page.waitForLoadState('domcontentloaded');
  const origin=new URL(page.url()).origin;
  await expect(page.locator('h1')).toContainText('欢迎回来');
  await page.evaluate(()=>localStorage.setItem('desktop.inspector','true'));
  await page.reload();
  await expect(page.locator('.desktop-inspector')).toHaveClass(/is-collapsed/);
  await expect(page.locator('.today-entry-grid > *')).toHaveCount(3);
  for(const width of [1440,1100]) {
    await application.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setSize(width,900),width);
    for(const route of ['/','/questions','/sources','/knowledge']) {
      await page.goto(origin+route);
      await page.locator('h1').first().waitFor({state:'attached'});
      await expect(page.locator('.desktop-inspector')).toHaveClass(/is-collapsed/);
      if(route==='/questions') {
        await page.locator('.questions-topic-card').first().waitFor();
        await page.locator('.questions-topic-card button').first().click();
        await expect(page.locator('.desktop-inspector')).toHaveClass(/is-open/);
        await expect(page.locator('.context-agent-panel')).toHaveCount(1);
        const input=page.locator('.context-agent-composer textarea');
        await input.fill('折叠后保留的草稿');
        await page.getByRole('button',{name:'关闭对话窗口',exact:true}).click();
        await expect(input).not.toBeVisible();
        await page.getByRole('button',{name:'展开AI 协作面板',exact:true}).click();
        await expect(input).toHaveValue('折叠后保留的草稿');
        await page.getByRole('tab',{name:'历史记录',exact:true}).click();
        await page.getByRole('tab',{name:'当前对话',exact:true}).click();
        await expect(input).toHaveValue('折叠后保留的草稿');
        await expect.poll(async()=>{const box=await input.boundingBox();return box.y+box.height;}).toBeLessThanOrEqual(900);
        await page.locator('.questions-filters button').last().click();
        await expect(page.locator('.questions-filters button').last()).toHaveAttribute('aria-pressed','true');
        await expect(input).toHaveValue('折叠后保留的草稿');
        await page.locator('.questions-filters button').first().click();
        await expect(page.locator('.questions-topic-card')).toHaveCount(4);
      }
      if(route==='/sources') {
        await page.locator('.source-file-row').first().waitFor();
        await page.locator('.source-connections-popover > summary').click();
        await expect(page.getByRole('button',{name:'连接原始目录',exact:true})).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button',{name:'连接原始目录',exact:true})).not.toBeVisible();
        await page.getByRole('button',{name:'导入资料',exact:true}).click();
        const dialog=page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('.import-file-picker')).toBeVisible();
        const columns=await dialog.locator('.import-type-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
        expect(columns).toBe(2);
        await dialog.locator('input[name="import-files"]').setInputFiles([{name:'匿名记录.md',mimeType:'text/markdown',buffer:Buffer.from('# 匿名记录\n原话保留。')},{name:'另一条.txt',mimeType:'text/plain',buffer:Buffer.from('这是一条记录。')}]);
        await page.getByRole('button',{name:'移除 另一条.txt',exact:true}).click();
        await expect(dialog.locator('.import-selection-list > div')).toHaveCount(1);
        await page.screenshot({path:path.join(captures,`import-${width}.png`)});
        await page.getByRole('button',{name:'下一步',exact:true}).click();
        await expect(dialog.locator('.import-summary')).toContainText('1 个');
        await page.getByRole('button',{name:'新建一个文件夹',exact:true}).click();
        await dialog.locator('input[name="new-import-folder"]').fill('设计验证');
        await expect(dialog.locator('.import-summary')).toContainText('设计验证');
        await page.getByRole('button',{name:'上一步',exact:true}).click();
        await expect(dialog.locator('.import-selection-list > div')).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button',{name:'导入资料',exact:true})).toBeFocused();
      }
      if(route==='/knowledge') {
        await expect(page.locator('.understanding-entry')).toHaveCount(4);
        await expect(page.locator('.understanding-latest').first()).toContainText('最新');
        await expect(page.locator('.understanding-digest')).not.toBeVisible();
        await page.locator('.understanding-detail-disclosure > summary').click();
        await expect(page.locator('.understanding-digest')).toBeVisible();
        await page.locator('.understanding-detail-disclosure > summary').click();
      }
      const box=await page.locator('.main-area').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
      expect(box.scroll,`${width} ${route} overflow`).toBeLessThanOrEqual(box.width+2);
      await page.screenshot({path:path.join(captures,`${route==='/'?'today':route.slice(1)}-${width}.png`)});
    }
  }
  expect(errors).toEqual([]);
  console.log('Redesign verified at 1440 and 1100px: four pages, default folded inspector, topic selection, retained draft/history, connection popover, import selection/removal/destination/back/Escape/focus, understanding disclosure.');
} finally {
  const process=application?.process();
  await application?.close();
  if(process && process.exitCode === null && process.signalCode === null) await new Promise(resolve=>process.once('exit',resolve));
  await rm(root,{recursive:true,force:true});
  await rm(linkedDirectory,{recursive:true,force:true});
}
