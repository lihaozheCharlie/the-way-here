import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { writeFile, rm, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(studio, 'apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { createServer } = await import(require.resolve('vite'));
const name = `.navigation-${process.pid}`, fixture = path.join(web, `${name}.tsx`), html = path.join(web, `${name}.html`);
const captures = path.join(studio, '.impeccable/review/source-tree-and-outline');
let server, browser;
try {
  await mkdir(captures, {recursive:true});
  await writeFile(fixture, `import React,{useState} from 'react';
import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom';
import {EditableDocument,ReadOnlyDocument} from './src/shared/markdown';
import {OrganizedSources} from './src/features/sources/Sources';
import {FolderTree} from './src/shared/FolderTree'; import {SourceConnectionsPanel} from './src/features/sources/SourceConnectionsPanel';
import {ImportMaterialsModal} from './src/features/sources/ImportMaterialsModal';
${['theme-tokens','base','form-controls','features','archive-foundation','refinements','archive-theme','sources-redesign','desktop','desktop-redesign'].map(x=>`import './src/styles/${x}.css';`).join('\n')}
import './src/shared/document.css'; import './src/styles/source-navigation.css';
const params=new URLSearchParams(location.search), dense=params.has('dense');
const markdown=params.has('short')?'一篇没有章节的匿名日记。':'# 春天的复盘\\n\\n'+Array.from({length:dense?16:4},(_,i)=>'## 第'+(i+1)+'节 · '+(i===1?'一段很长的小标题用于检验目录是否能够完整显示并且最多换成两行文字':'这个季度发生了什么')+'\\n\\n'+('走过小区时发现树已开花。这是一段匿名的阅读与编辑测试材料。\\n\\n').repeat(3)+'### 生活 '+(i+1)+'\\n\\n这段记录保留自己的节奏。\\n\\n').join('');
const doc={id:'demo-doc',title:'春天的复盘',relativePath:'sources/日记/春天的复盘.md',modifiedAt:'2026-10-10T00:00:00Z',isSource:false,markdown,renderedMarkdown:markdown,properties:{},tags:[],aliases:[],locations:[],sources:[],sections:[],outgoingLinks:[],incomingLinks:[],category:'sources',excerpt:''};
function App(){if(params.has('integrated'))return <MemoryRouter><div className="desktop-shell" style={{display:'block',padding:20,height:'100vh'}}><OrganizedSources revision={0}/></div></MemoryRouter>;const [selected,setSelected]=useState(''),[token,setToken]=useState(0),[modal,setModal]=useState(params.has('import'));return <MemoryRouter><div className="desktop-shell organized-sources-page" style={{display:'block',padding:20,height:'100vh'}}><button onClick={()=>setModal(true)}>导入资料</button><main id="test-scroll" style={{height:'calc(100vh - 65px)',overflow:'auto'}}><div className="source-vault" style={params.has('doc')?{display:'block'}:{display:'grid',gridTemplateColumns:'272px minmax(0,1fr)',alignItems:'start'}}>
{!params.has('doc')&&<aside className="source-folder-pane" style={{background:'var(--paper)',minHeight:600}}><header style={{padding:16,display:'flex',justifyContent:'space-between'}}><b>文件夹</b><button aria-label="新建文件夹" onClick={()=>setToken(x=>x+1)}>＋</button></header><SourceConnectionsPanel compact/><FolderTree selected={selected} onSelect={setSelected} createToken={token} counts={new Map([['日记',8],['日记/2026',4],['外部来源/local',12]])} total={20}/><output data-testid="selected">{selected}</output></aside>}
<article className="source-preview">{params.has('readonly')?<ReadOnlyDocument page={doc} id={doc.id} markdown={markdown} readOnlyReason="历史版本 10月9日 21:40"/>:<EditableDocument page={doc} variant="preview" relations={params.has('relations')?<p>关联来源 · 匿名日记</p>:undefined}/>}</article></div></main>{modal&&<ImportMaterialsModal folders={['聊天记录','消费账单','照片记忆']} currentFolder="" onClose={()=>setModal(false)} onImported={()=>{}} onConnected={()=>{}} onJourney={()=>{}}/>}</div></MemoryRouter>};createRoot(document.getElementById('root')).render(<App/>);`);
  await writeFile(html, `<html lang="zh-CN"><meta charset="utf-8"><div id="root"></div><script type="module" src="/${name}.tsx"></script></html>`);
  server=await createServer({root:web,server:{host:'127.0.0.1',port:0,open:false},logLevel:'error'}); await server.listen();
  const url=`http://127.0.0.1:${server.httpServer.address().port}/${name}.html`;
  console.log(`Verification listener: ${server.httpServer.address().port}`);
  browser=await chromium.launch({headless:true,...(await access('/Applications/Google Chrome.app').then(()=>true,()=>false)?{channel:'chrome'}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let writes=0, createRequests=[], actionRequests=[], imported;
  const requests=[];const folders=[{path:'日记',label:'日记'},{path:'聊天记录',label:'聊天记录'},{path:'消费账单',label:'消费账单'},{path:'照片记忆',label:'照片记忆'},{path:'外部来源/local',label:'日记',absolutePath:'/anonymous/Documents/日记',external:true},{path:'外部来源/missing',label:'旅行手账',absolutePath:'/anonymous/gone',external:true,unavailable:true,hasChildren:false}];
  const children={'日记':[{path:'日记/2026',label:'2026'},{path:'日记/空目录',label:'空目录'}],'日记/2026':[{path:'日记/2026/十月',label:'十月'}],'聊天记录':[{path:'聊天记录/ChatGPT',label:'ChatGPT'}]};
  await page.route('**/api/**',async route=>{const request=route.request(), u=new URL(request.url()), data=request.postDataJSON();let json={};
    if(u.pathname==='/api/vault')json={knowledgeBaseId:'demo'};
    else if(u.pathname==='/api/sources/folders'&&request.method()==='GET'){const p=u.searchParams.get('parent')||'';requests.push(p);json=p?(children[p]||[]):new URL(page.url()).searchParams.has('empty')?[]:new URL(page.url()).searchParams.has('internal')?folders.filter(n=>!n.external):folders;}
    else if(u.pathname==='/api/sources/folders'){createRequests.push(data);(children[data.folder.split('/').slice(0,-1).join('/')]||=[]).push({path:data.folder,label:data.folder.split('/').at(-1)});json={path:data.folder};}
    else if(u.pathname==='/api/sources/folder-action'){actionRequests.push(data);json={path:data.folder};}
    else if(u.pathname==='/api/source-connections')json=[];
    else if(u.pathname==='/api/pages')json=new URL(page.url()).searchParams.has('empty')?[]:[{id:'日记/2026/春天的复盘',title:'春天的复盘',relativePath:'sources/日记/2026/春天的复盘.md',modifiedAt:'2026-10-10T00:00:00Z',isSource:true,properties:{},tags:[],aliases:[],locations:[],sources:[],sections:[],outgoingLinks:[],incomingLinks:[],category:'sources',excerpt:'散步时发现树已开花。'}];
    else if(u.pathname==='/api/imports')json=[];
    else if(u.pathname.startsWith('/api/pages/')){if(request.method()==='GET')json={id:'日记/2026/春天的复盘',title:'春天的复盘',relativePath:'sources/日记/2026/春天的复盘.md',modifiedAt:'2026-10-10T00:00:00Z',isSource:true,markdown:'# 春天的复盘\n\n## 散步\n\n匿名测试材料。\n\n## 新的节奏\n\n记录日常。',renderedMarkdown:'## 散步\n\n匿名测试材料。\n\n## 新的节奏\n\n记录日常。',properties:{},tags:[],aliases:[],locations:[],sources:[],sections:[],outgoingLinks:[],incomingLinks:[],category:'sources',excerpt:'',relatedPages:Array.from({length:12},(_,i)=>({id:'knowledge-'+i,title:'一段很长的关联理解标题，用来检查卡片内换行与滚动 '+(i+1),category:'patterns',isSource:false,excerpt:'匿名摘要'}))};else{writes++;json={ok:true,modifiedAt:'2026-10-10T01:00:00Z'};}}
    else if(u.pathname==='/api/imports/files'){imported=data;json={id:'batch',files:[],channel:data.channel};}
    await route.fulfill({json});
  });
  await page.goto(url);await expect(page.getByRole('treeitem',{name:/应用资料/})).toHaveCount(0);
  const tree=page.getByRole('tree',{name:'文件夹树'}), node=p=>tree.locator(`[data-folder="${p}"]`);
  await expect(node('日记')).toBeVisible();expect(requests).not.toContain('日记');
  await node('日记').click();await expect(node('日记/2026')).toBeVisible();await expect(node('日记/2026/十月')).toHaveCount(0);
  await node('日记/2026').click();await expect(node('日记/2026/十月')).toBeVisible();
  await node('日记/2026').press('ArrowDown');await expect(node('日记/2026/十月')).toBeFocused();await node('日记/2026/十月').press('ArrowLeft');await expect(node('日记/2026')).toBeFocused();
  await node('日记/2026').press('Meta+Shift+n');const input=page.getByRole('textbox',{name:'新文件夹名称'});await input.fill('新笔记');await input.press('Enter');await expect(page.getByTestId('selected')).toHaveText('日记/2026/新笔记');expect(createRequests.at(-1).knowledgeBaseId).toBe('demo');
  await node('外部来源/local').click({button:'right'});await expect(page.getByRole('menuitem',{name:'从列表移除'})).toBeVisible();await expect(page.getByText('只移除入口，不会删除磁盘上的文件')).toBeVisible();await page.keyboard.press('Escape');
  await node('日记/2026').click({button:'right'});await expect(page.getByRole('menuitem',{name:'重命名',exact:true})).toBeVisible();await expect(page.getByRole('menuitem',{name:'移到废纸篓'})).toBeVisible();await page.keyboard.press('Escape');
  await expect(node('外部来源/missing').getByRole('button',{name:'重新连接'})).toBeVisible();
  await page.reload();await expect(node('日记/2026/十月')).toBeVisible();
  await page.screenshot({animations:'disabled',path:path.join(captures,'desktop-tree.png')});
  await page.evaluate(()=>localStorage.setItem('the-way-here.import-route','files'));await page.getByRole('button',{name:'导入资料',exact:true}).click();
  await expect(page.locator('.import-type-grid > button')).toHaveCount(3);await expect(page.getByRole('button',{name:/聊天记录.*平台/})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.import-type-grid small').first()).toBeVisible();await expect(page.getByRole('button',{name:'下一步'})).toBeDisabled();
  expect(await page.locator('.import-type-grid').evaluate(n=>getComputedStyle(n).display)).toBe('grid');
  await page.screenshot({animations:'disabled',path:path.join(captures,'import-step-one.png')});
  await page.locator('input[name="import-files"]').setInputFiles({name:'chat.txt',mimeType:'text/plain',buffer:Buffer.from('匿名聊天记录')});await page.getByRole('button',{name:'下一步'}).click();
  const picker=page.getByRole('tree',{name:'保存位置'});await expect(picker.locator('[data-folder="聊天记录"]')).toHaveAttribute('aria-selected','true');await expect(picker.locator('[data-folder^="外部来源/"]')).toHaveCount(0);
  await picker.locator('[data-folder="聊天记录"]').click();await expect(picker.locator('[data-folder="聊天记录/ChatGPT"]')).toBeVisible();await picker.locator('[data-folder="聊天记录/ChatGPT"]').click();
  await page.getByRole('button',{name:'新建文件夹',exact:true}).click();const nested=page.getByRole('textbox',{name:'新文件夹名称'});await nested.fill('十月');await nested.press('Enter');await expect(page.locator('.import-selected-path')).toContainText('聊天记录/ChatGPT/十月');
  await page.screenshot({animations:'disabled',path:path.join(captures,'import-step-two.png')});await page.getByRole('button',{name:'导入 1 个文件'}).click();await expect.poll(()=>imported?.targetFolder).toBe('聊天记录/ChatGPT/十月');
  for(const width of [1440,900]){
    await page.setViewportSize({width,height:1000});await page.goto(url+'?doc');const body=page.locator('.editable-document-body'), rail=page.locator('.document-tick-rail');await expect(rail).toBeVisible();
    const before=await body.boundingBox();expect(before.width).toBe(720);
    const first=rail.locator('button').first();if(width<980)await first.click();else await first.hover();await expect(page.locator('.document-outline-card')).toBeVisible();
    expect((await body.boundingBox()).width).toBe(before.width);expect((await body.boundingBox()).x).toBe(before.x);
    if(width<980)await expect(page.getByRole('button',{name:'固定目录',exact:true})).toBeDisabled();
    else {await page.getByRole('button',{name:'固定目录',exact:true}).click();await expect(page.locator('.document-navigation-host')).toHaveCSS('width','244px');await page.getByRole('button',{name:'固定目录',exact:true}).click();}
    await page.screenshot({animations:'disabled',path:path.join(captures,`${width}-reading.png`)});
    const headingStyle=await body.locator('h2').first().evaluate(n=>{const s=getComputedStyle(n);return {fontSize:s.fontSize,fontFamily:s.fontFamily,fontWeight:s.fontWeight,lineHeight:s.lineHeight}});await body.press('Enter');const editor=page.locator('[data-document-editor]');await expect(editor).toBeVisible();expect(await editor.locator('.document-editor-heading-2').first().evaluate(n=>{const s=getComputedStyle(n);return {fontSize:s.fontSize,fontFamily:s.fontFamily,fontWeight:s.fontWeight,lineHeight:s.lineHeight}})).toEqual(headingStyle);
    if(width<980){if(!await page.locator('.document-outline-card').isVisible())await first.click();}else await first.hover();await expect(page.getByText('跟随光标', {exact:true})).toBeVisible();
    const second=page.locator('.outline-item').filter({hasText:'第2节'});await second.click();await expect(editor).toBeFocused();await expect(second).toHaveAttribute('aria-current','location');if(width<980)await expect(page.locator('.document-outline-card')).toBeHidden();
    const heading=await editor.evaluate(n=>getSelection()?.anchorNode?.parentElement?.closest('.cm-line')?.textContent);expect(heading).toContain('第2节');
    await page.keyboard.insertText('补充');await expect.poll(()=>writes).toBeGreaterThan(0);
    await page.keyboard.press('Meta+ArrowDown');await expect(page.locator('.outline-item.active')).toContainText('生活 2');
    await page.screenshot({animations:'disabled',path:path.join(captures,`${width}-editing.png`)});
    await editor.press('Escape');await expect(body).toBeVisible();
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto(url+'?doc&readonly');await expect(page.getByRole('button',{name:'编辑',exact:true})).toHaveCount(0);await expect(page.locator('.document-readonly-badge')).toHaveCount(0);await page.locator('.document-tick').first().hover();await expect(page.locator('.outline-mode.readonly')).toHaveCount(0);await page.screenshot({animations:'disabled',path:path.join(captures,'readonly.png')});
  await page.goto(url+'?doc&dense');await expect(page.locator('.document-tick')).toHaveCount(14);await page.locator('.document-tick').first().hover();await expect(page.locator('.outline-section-toggle')).toHaveCount(16);await page.screenshot({animations:'disabled',path:path.join(captures,'dense.png')});
  await page.goto(url+'?doc&relations');await page.locator('.document-tick').first().hover();await page.getByRole('button',{name:'关联',exact:true}).click();await expect(page.getByText('关联来源 · 匿名日记')).toBeVisible();
  await page.goto(url+'?doc&short');await expect(page.locator('.document-navigation-host')).toHaveCount(0);expect((await page.locator('.editable-document-body').boundingBox()).width).toBe(720);
  await page.goto(url+'?integrated');
  const recordBody=page.locator('.source-preview .editable-document-body');
  await expect(recordBody).toContainText('匿名测试材料');
  await expect(page.getByRole('button',{name:'编辑',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'阅读',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'新建记录',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'新建文件夹',exact:true})).toBeDisabled();
  await expect(page.locator('.document-navigation-host')).toHaveCSS('width','150px');
  await page.getByRole('tree',{name:'文件夹树'}).locator('[data-folder="日记"]').click();
  await expect(page.getByText('这个文件夹里还没有文件')).toBeVisible();
  await page.getByRole('button',{name:'筛选与排序',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'含子文件夹',exact:true}).click();
  await expect(recordBody).toBeVisible();
  await expect(page.locator('.record-document-path')).toContainText('日记');
  await page.screenshot({animations:'disabled',path:path.join(captures,'integrated-sources.png')});
  await page.getByRole('button',{name:'收起目录',exact:true}).click();
  await expect(page.locator('.document-navigation-host')).toHaveCSS('width','28px');
  await page.mouse.move(0,0);await page.locator('.source-preview').click({position:{x:10,y:80}});
  await expect(page.locator('.document-outline-card')).toBeHidden();
  await page.locator('.document-tick').first().hover();
  await expect(page.locator('.document-outline-card')).toBeVisible();
  await expect(page.getByRole('button',{name:'关联',exact:true})).toHaveCount(0);
  await expect(page.locator('.document-navigation-tabs')).toHaveCount(0);
  const connections=page.locator('.source-knowledge-connections');await expect(connections).toBeVisible();await expect(connections).not.toHaveAttribute('open','');await connections.locator('summary').click();await expect(connections).toHaveAttribute('open','');await expect(connections.locator('nav a')).toHaveCount(8);await connections.getByRole('button',{name:'查看全部 12 个关联页面'}).click();await expect(connections.locator('nav a')).toHaveCount(12);await expect(connections.locator('nav a').first()).toHaveAttribute('href','/page/knowledge-0');await connections.getByRole('button',{name:'收起部分页面'}).click();await expect(connections.locator('nav a')).toHaveCount(8);await connections.locator('summary').click();await expect(connections.locator('nav')).toBeHidden();
  await page.screenshot({animations:'disabled',path:path.join(captures,'integrated-relations.png')});
  await page.goto(url+'?integrated&internal');
  await expect(page.getByRole('tree',{name:'文件夹树'}).locator('[data-folder="日记"]')).toBeVisible();
  await expect(page.locator('.folder-tree-empty')).toHaveCount(0);
  await expect(page.locator('.source-folder-hint')).toHaveCount(0);
  await page.getByRole('button',{name:'筛选与排序',exact:true}).click();
  await page.getByRole('menuitemradio',{name:'含子文件夹',exact:true}).click();
  await expect(recordBody).toBeVisible();
  await page.screenshot({animations:'disabled',path:path.join(captures,'internal-folders-no-empty.png')});
  const beforeEmptyRequests=requests.length;await page.goto(url+'?integrated&empty');await expect(page.locator('.folder-tree-empty')).toBeVisible();await expect(page.getByRole('tree',{name:'文件夹树'})).toHaveAttribute('aria-busy','false');await expect(page.locator('.folder-tree-empty')).toContainText('还没有打开文件夹');await expect(page.locator('.folder-tree-empty p')).toHaveCount(1);expect(requests.slice(beforeEmptyRequests).every(parent=>parent==='')).toBe(true);await page.screenshot({animations:'disabled',path:path.join(captures,'empty-folders.png')});
  expect(errors).toEqual([]);console.log('Verified: lazy tree, keyboard navigation, inline creation, root/child menus, missing root, remembered expansion; three import types, files preference migration, nested destination and creation; zero-width rail, overlay/pin/narrow behavior, editor caret, autosave, shortcuts, read-only, dense headings, relations and no-heading layout.');
} finally {await browser?.close();await server?.close();await Promise.all([rm(fixture,{force:true}),rm(html,{force:true})]);console.log('Verification browser and listener closed.');}
