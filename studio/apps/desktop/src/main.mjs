import { waitForService } from './service-process.mjs';
import { prepareWorkspace, saveWorkspace } from './workspace.mjs';
import { speechSession } from "./speech.mjs";
import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell, dialog, Notification, utilityProcess, session, systemPreferences, net } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, realpath } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { localRoute, allowedExternal, trustedSender } from './policy.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const studio = path.resolve(here, '../../..');
const windows = new Set();
const token = randomBytes(32).toString('hex');
let origin, workspace, worker, tray, speech, quitting = false, speechStarting = false;
app.setName('The Way Here');
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => showMain());
function showMain() {
  const main = [...windows].find((win) => win.kind === 'main');
  if (main) { if (main.isMinimized()) main.restore(); main.show(); main.focus(); }
  else if (origin) openWindow('/', 'main');
}
function command(value) { (BrowserWindow.getFocusedWindow() || [...windows][0])?.webContents.send('desktop:command', value); }
function openWindow(route, kind = 'reader') {
  route = localRoute(route);
  if (['settings', 'capture'].includes(kind)) { const existing = [...windows].find((win) => win.kind === kind); if (existing) { existing.show(); existing.focus(); return; } }
  const compact = kind === 'capture';
  const win = new BrowserWindow({ title: 'The Way Here', width: compact ? 560 : kind === 'settings' ? 800 : 1380, height: compact ? 580 : 900, minWidth: compact ? 500 : kind === 'settings' ? 700 : 900, minHeight:480, show:false, titleBarStyle:'hiddenInset', trafficLightPosition:{x:14,y:16}, backgroundColor:'#FBFAF8', webPreferences:{ preload:path.join(here,'preload.cjs'), sandbox:true, contextIsolation:true, nodeIntegration:false, spellcheck:true } });
  win.kind = kind; windows.add(win);
  win.webContents.setWindowOpenHandler(({url}) => { if (trustedSender(url, origin)) openWindow(new URL(url).pathname + new URL(url).search); else if (allowedExternal(url)) void shell.openExternal(url); return {action:'deny'}; });
  win.webContents.on('will-navigate', (event,url) => { if (!trustedSender(url,origin)) { event.preventDefault(); if (allowedExternal(url)) void shell.openExternal(url); } });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => windows.delete(win));
  win.on('close', (event) => { if (kind === 'main' && !quitting && process.platform === 'darwin') { event.preventDefault(); win.hide(); } });
  void win.loadURL(origin + route);
}
async function chooseWorkspace() {
  if (process.env.THE_WAY_HERE_VAULT) return path.resolve(process.env.THE_WAY_HERE_VAULT);
  if (!app.isPackaged) return path.resolve(studio,'..');
  return prepareWorkspace({userData:app.getPath('userData'), resources:path.join(process.resourcesPath,'workspace-template')});
}
async function startServer() {
  const entry = app.isPackaged ? path.join(process.resourcesPath,'server/dist/index.js') : path.join(studio,'apps/server/dist/index.js');
    worker = utilityProcess.fork(entry,[],{ env:{...process.env, THE_WAY_HERE_VAULT:workspace, PATH:[...(app.isPackaged ? [path.join(process.resourcesPath,'python/bin')] : []), path.join(app.getPath('home'),'.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || '/usr/bin:/bin'].join(path.delimiter), THE_WAY_HERE_PORT:'0', THE_WAY_HERE_DESKTOP_TOKEN:token, THE_WAY_HERE_WEB_ROOT:app.isPackaged ? path.join(process.resourcesPath,'web') : path.join(studio,'apps/web/dist'), THE_WAY_HERE_DEV:''}, stdio:'pipe', serviceName:'The Way Here local service' });
  worker.stderr?.on('data', (data) => process.stderr.write(data));
  const address = await waitForService(worker);
  worker.once('exit', () => { if (!quitting) dialog.showErrorBox('本地服务已停止','请退出并重新打开应用。已保存的生活记录仍在知识空间中。'); });
  return address;
}

function registerIPC() {
  function handle(name, fn) { ipcMain.handle(name, (event,...args) => { if (!trustedSender(event.senderFrame?.url,origin)) throw new Error('不受信任的页面'); return fn(...args); }); }
  handle('desktop:window', (route,kind) => { if (!['reader','focus','settings','capture',undefined].includes(kind)) throw new Error('无效的窗口类型'); openWindow(route,kind); });
  handle('desktop:choose-source-directory', async () => { const result = await dialog.showOpenDialog({ title: '连接原始资料目录', properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0]; });
  handle('desktop:reveal', async () => { const error = await shell.openPath(workspace); if (error) throw new Error(error); });
  handle('desktop:speech-start', async () => {
    if (speech || speechStarting) throw new Error('已有一段录音正在进行');
    speechStarting = true;
    try {
    if (process.platform !== 'darwin' || !await systemPreferences.askForMediaAccess('microphone')) throw new Error('请在系统设置中允许麦克风访问');
    const binary = app.isPackaged ? path.join(process.resourcesPath,'native/speech-capture') : path.join(studio,'apps/desktop/dist/speech-capture');
    await access(binary); speech = speechSession(binary);
    } finally { speechStarting = false; }
  });
  handle('desktop:speech-stop', async () => { if (!speech) return ''; const current = speech; current.stop(); try { return await current.result; } finally { speech = undefined; } });
  handle('desktop:badge', (count) => { if (!Number.isInteger(count) || count < 0 || count > 9999) throw new Error('无效的数量'); app.dock?.setBadge(count ? String(count) : ''); });
  handle('desktop:notify', (payload) => {
    if (!payload || typeof payload.title !== 'string' || typeof payload.body !== 'string') throw new Error('无效的通知');
    const route = localRoute(payload.route);
    if (Notification.isSupported()) { const notification = new Notification({title:payload.title.slice(0,100),body:payload.body.slice(0,300)}); notification.on('click', () => openWindow(route)); notification.show(); }
  });
}
async function openExistingWorkspace() {
  const selection = await dialog.showOpenDialog({title:'打开已有知识空间', message:'选择之前使用的知识空间文件夹。导入普通资料请使用“连接原始目录”。', properties:['openDirectory']});
  if (selection.canceled) return;
  const root = selection.filePaths[0];
  try { await access(path.join(root,'the-way-here.config.yaml')); }
  catch { dialog.showErrorBox('这不是已有的知识空间','请选之前由 The Way Here 创建的知识空间。普通文档文件夹可以在应用的“资料”中连接。'); return; }
  await saveWorkspace(app.getPath('userData'), await realpath(root));
  app.relaunch(); app.quit();
}
function installMenu() {
  const action = (label,accelerator,value) => ({label,accelerator,click:() => command(value)});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'The Way Here',submenu:[{role:'about'},action('偏好设置…','CmdOrCtrl+,','settings'),{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
    {label:'文件',submenu:[{label:'打开已有知识空间…',click:() => void openExistingWorkspace()}, {type:'separator'},action('随手记','CmdOrCtrl+N','capture'),action('导入生活记录…','CmdOrCtrl+O','import'),action('在独立窗口打开','CmdOrCtrl+Return','detach'),action('深入聊聊','CmdOrCtrl+Shift+F','focus'),{type:'separator'},{role:'close'}]},
    {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}, {type:'separator'}, {role:'startSpeaking'},{role:'stopSpeaking'}]},
    {label:'显示',submenu:[action('搜索与命令','CmdOrCtrl+K','search'),action('AI 协作面板','CmdOrCtrl+Alt+I','inspector'),action('返回','CmdOrCtrl+[','back'),action('前进','CmdOrCtrl+]','forward'),{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'},...(!app.isPackaged ? [{role:'toggleDevTools'}] : [])]},
    {label:'知识库',submenu:Array.from({length:9},(_,i) => action(`打开知识库 ${i+1}`,`CmdOrCtrl+${i+1}`,`knowledge-base:${i+1}`))},
    {label:'窗口',submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}, {label:'主窗口',click:showMain}]},
  ]));
  const trayPath = app.isPackaged ? path.join(process.resourcesPath,'native/trayTemplate.png') : path.join(studio,'apps/desktop/dist/trayTemplate.png');
  const image = nativeImage.createFromPath(trayPath);
  image.setTemplateImage(true);
  tray = new Tray(image); tray.setToolTip('The Way Here'); tray.setContextMenu(Menu.buildFromTemplate([{label:'随手记',click:() => openWindow('/capture','capture')},{label:'打开 The Way Here',click:showMain},{type:'separator'},{role:'quit'}]));
}
app.whenReady().then(async () => {
  workspace = await chooseWorkspace(); if (!workspace) return app.quit();
  workspace = await realpath(workspace);
  const serviceOrigin = await startServer();
  origin = `https://workspace-${createHash('sha256').update(workspace).digest('hex').slice(0,20)}.localhost`;
  session.defaultSession.protocol.handle('https', async (request) => {
    if (!trustedSender(request.url,origin)) return net.fetch(request,{bypassCustomProtocolHandlers:true});
    const url = new URL(request.url);
    const headers = new Headers(request.headers); headers.set('X-TWH-Desktop',token);
    headers.delete('host');
    return fetch(serviceOrigin + url.pathname + url.search, { method:request.method, headers, body:['GET','HEAD'].includes(request.method) ? undefined : request.body, duplex:'half', signal:request.signal });
  });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(trustedSender(contents?.getURL(),origin) && permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((contents, permission) => trustedSender(contents?.getURL(),origin) && permission === 'media');
  const iconPath = app.isPackaged ? path.join(process.resourcesPath,'native/app-icon.png') : path.join(studio,'apps/desktop/dist/app-icon.png');
  app.dock?.setIcon(nativeImage.createFromPath(iconPath));
  app.setAboutPanelOptions({ applicationName: 'The Way Here', iconPath });
  registerIPC(); installMenu(); openWindow('/','main');
}).catch(async (error) => { console.error('Desktop startup failed:',error); if (!app.commandLine.hasSwitch('diagnostics')) { const result = await dialog.showMessageBox({type:'error',message:'暂时无法打开知识空间',detail:error.message,buttons:['退出','打开已有知识空间…'],defaultId:0,cancelId:0}); if (result.response === 1) await openExistingWorkspace(); } app.quit(); });
app.on('activate',showMain);
app.on('before-quit', () => { quitting = true; speech?.cancel(); worker?.kill(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
