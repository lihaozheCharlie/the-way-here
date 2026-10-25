import { DesktopRuntime } from './runtime-process.mjs';
import { assetResponse } from './asset-response.mjs';
import { prepareWorkspace, saveWorkspace } from './workspace.mjs';
import { assertSpeechEngine, transcribeRecording } from "./speech-transcriber.mjs";
import { speechSession } from "./speech.mjs";
import { PhotoLibrary } from './photo-library.mjs';
import { app, BrowserWindow, Menu, Tray, globalShortcut, nativeImage, ipcMain, shell, dialog, Notification, utilityProcess, session, systemPreferences, net, safeStorage } from 'electron';
import { ScopedAccess } from './scoped-access.mjs';
import { prepareMasCodexHome } from './codex-home.mjs';
import { attachSecretService } from './secret-service.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants } from 'node:fs';
import { access, realpath, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { localRoute, allowedExternal, trustedSender } from './policy.mjs';
import { t, setLocale, readPersistedLocale, persistLocale } from './locale.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const studio = path.resolve(here, '../../..');
const windows = new Set();
let origin, runtimeClient, workspace, worker, tray, speech, scopes, quitting = false, speechStarting = false;
let serviceRestart = Promise.resolve();
let distribution = {};
let masCodex;
const speechRecordings = new WeakMap();
const photoLibraries = new Map();
const photoWatchers = new WeakSet();
function photosFor(sender) {
  if (process.platform !== 'darwin') throw new Error(t('照片库目前仅支持 macOS 桌面应用'));
  if (!photoLibraries.has(sender)) {
    const binary = app.isPackaged ? path.join(process.resourcesPath, 'native/photo-library') : path.join(studio, 'apps/desktop/dist/photo-library');
    const library = new PhotoLibrary(binary);
    photoLibraries.set(sender, library);
    if (!photoWatchers.has(sender)) {
      photoWatchers.add(sender);
      const release = () => { photoLibraries.get(sender)?.close(); photoLibraries.delete(sender); };
      sender.once('destroyed', release);
      sender.on('render-process-gone', release);
      // A full navigation (including switching knowledge bases) does not run
      // React unmount cleanup reliably. Release the old document's access here.
      sender.on('did-start-navigation', details => { if (details.isMainFrame && !details.isSameDocument) release(); });
    }
  }
  return photoLibraries.get(sender);
}
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
  const win = new BrowserWindow({ title: 'The Way Here', width: compact ? 420 : kind === 'settings' ? 800 : 1380, height: compact ? 580 : 900, minWidth: compact ? 380 : kind === 'settings' ? 700 : 900, minHeight:480, alwaysOnTop:compact, skipTaskbar:compact, show:false, titleBarStyle:'hiddenInset', trafficLightPosition:{x:14,y:12}, backgroundColor:'#f3f7fd', webPreferences:{ preload:path.join(here,'preload.cjs'), additionalArguments:process.mas ? ['--twh-mas'] : [], sandbox:true, contextIsolation:true, nodeIntegration:false, spellcheck:true, backgroundThrottling:kind !== 'main' } });
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
async function startRuntime() {
  const entry = app.isPackaged ? path.join(process.resourcesPath,'server/dist/desktop.js') : path.join(studio,'apps/server/dist/desktop.js');
    worker = utilityProcess.fork(entry,[],{ env:{...process.env,
      ...(app.isPackaged ? {TWH_DESKTOP_SECURE_SETTINGS:'1', TWH_BUNDLED_ENGINE:path.join(process.resourcesPath,'workspace-template/knowledge-engine'), TWH_BUNDLED_PYTHON:path.join(process.resourcesPath,'python/bin/python3'), TWH_KNOWLEDGE_RUNNER:path.join(process.resourcesPath,'native/run-knowledge-tool.py'), TWH_OPERATOR:distribution.operator || '', TWH_PRIVACY_URL:distribution.privacyUrl || '', TWH_SUPPORT_URL:distribution.supportUrl || ''} : {}),
      ...(process.mas ? {TWH_MAS:'1', TWH_CODEX_COMMAND:path.join(process.resourcesPath,'codex/bin/codex'), CODEX_HOME:masCodex.home, TWH_CODEX_WORKDIR:masCodex.cwd} : {}),
      TWH_APP_CACHE_ROOT:path.join(app.getPath('userData'), 'cache'), THE_WAY_HERE_VAULT:workspace, PATH:[...(app.isPackaged ? [path.join(process.resourcesPath,'python/bin')] : []), path.join(app.getPath('home'),'.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || '/usr/bin:/bin'].join(path.delimiter), THE_WAY_HERE_DEV:''}, stdio:'pipe', serviceName:'The Way Here knowledge runtime' });
  attachSecretService(worker, safeStorage);
  worker.stderr?.on('data', (data) => process.stderr.write(data));
  runtimeClient = new DesktopRuntime(worker);
  await runtimeClient.ready;
  const started = worker;
  worker.once('exit', () => { if (!quitting && worker === started) dialog.showErrorBox('本机运行时已停止','请退出并重新打开应用。已保存的生活记录仍在知识空间中。'); });
  return runtimeClient;
}

async function restartForAccess() {
  if (!process.mas) return;
  serviceRestart = serviceRestart.catch(() => undefined).then(async () => {
    if (quitting) throw new Error('应用正在退出');
    const previous = worker; worker = undefined;
    if (previous) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('本机运行时未能停止，请退出并重新打开应用。')), 10_000);
      previous.once('exit', () => { clearTimeout(timer); resolve(); }); previous.kill();
    });
    if (!quitting) runtimeClient = await startRuntime();
  });
  return serviceRestart;
}

async function connectCodex() {
  const program = process.mas ? null : await dialog.showOpenDialog({title:t('选择已安装的 Codex CLI 程序'), properties:['openFile','showHiddenFiles']});
  if (program?.canceled) return false;
  const home = await dialog.showOpenDialog({title:t('选择 Codex 登录与配置目录'), message:t('选择已通过 ChatGPT 登录的 Codex 配置目录，通常名为 .codex。商店版只导入登录，不导入历史对话、插件或自定义模型配置。连接后会重启本机运行时并停止活动 AI 任务，请先完成当前工作。'), properties:['openDirectory','showHiddenFiles'], securityScopedBookmarks:!!process.mas});
  if (home.canceled) return false;
  if (program) await scopes.grant(program.filePaths[0], program.bookmarks?.[0], 'codex-bin');
  await scopes.grant(home.filePaths[0], home.bookmarks?.[0], 'codex-home');
  if (process.mas) masCodex = await prepareMasCodexHome(app.getPath('userData'), home.filePaths[0]);
  await restartForAccess(); return true;
}

function registerIPC() {
  function handle(name, fn, withSender = false) { ipcMain.handle(name, (event,...args) => { if (!trustedSender(event.senderFrame?.url,origin)) throw new Error(t('不受信任的页面')); return withSender ? fn(event.sender, ...args) : fn(...args); }); }
  handle('desktop:set-locale', (next) => {
    const chosen = next === 'en' ? 'en' : 'zh';
    setLocale(chosen);
    persistLocale(path.join(app.getPath('userData'), 'locale.json'), chosen);
    installMenu();
  });
  handle('desktop:window', (route,kind) => { if (!['reader','focus','settings','capture',undefined].includes(kind)) throw new Error(t('无效的窗口类型')); openWindow(route,kind); });
  handle('desktop:connect-codex', connectCodex);
  handle('desktop:privacy', async () => { openWindow('/privacy', 'reader'); });
  handle('desktop:photos-status', sender => photosFor(sender).status(), true);
  handle('desktop:photos-filters', sender => photosFor(sender).filters(), true);
  handle('desktop:photos-authorize', sender => photosFor(sender).authorize(), true);
  handle('desktop:photos-search', (sender, input) => photosFor(sender).search(input), true);
  handle('desktop:photos-image', (sender, input) => photosFor(sender).image(input), true);
  handle('desktop:photos-cancel', sender => photosFor(sender).cancelSearch(), true);
  handle('desktop:photos-retain', (sender, input) => photosFor(sender).retain(input), true);
  handle('desktop:photos-export', (sender, input) => photosFor(sender).export(input), true);
  handle('desktop:photos-close', sender => { photoLibraries.get(sender)?.close(); photoLibraries.delete(sender); }, true);
  handle('desktop:photos-settings', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Photos'));
  handle('desktop:folder-permission', async () => {
    const result = await dialog.showMessageBox({ type: 'warning', title: t('需要文件夹权限'), message: t('无法读写文件，请在系统设置中允许 The Way Here 访问该文件夹，然后重试。'), buttons: [t('打开系统设置'), t('取消')], cancelId: 1 });
    if (result.response === 0) await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders');
  });
  handle('desktop:choose-source-directory', async () => {
    const result = await dialog.showOpenDialog({ title: t('打开文件夹'), properties: ['openDirectory'], securityScopedBookmarks:!!process.mas });
    if (result.canceled) return null;
    const selected = result.filePaths[0];
    const consent = await dialog.showMessageBox({ type: 'question', title: t('允许 AI 修改文件夹'), message: t('允许 AI 修改此文件夹及子文件夹中的内容？'), detail: selected + (process.mas ? `\n${t('授权后会重启本机运行时并停止活动 AI 任务，请先完成当前工作。')}` : ''), buttons: [t('允许并打开'), t('取消')], defaultId: 0, cancelId: 1 });
    if (consent.response !== 0) return null;
    await scopes.grant(selected, result.bookmarks?.[0]);
    try { await access(selected, constants.R_OK | constants.W_OK); }
    catch {
      await dialog.showMessageBox({ type: 'warning', title: t('需要文件夹权限'), message: t('无法读写此文件夹，请允许 The Way Here 访问后重新选择。'), detail: selected, buttons: [t('打开系统设置'), t('取消')], cancelId: 1 }).then(async result => { if (result.response === 0) await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders'); });
      return null;
    }
    await restartForAccess(); return selected;
  });
  handle('desktop:reveal', async () => { const error = await shell.openPath(workspace); if (error) throw new Error(error); });
  handle('desktop:speech-start', async (sender) => {
    if (speech || speechStarting) throw new Error('已有一段录音正在进行');
    speechStarting = true;
    try {
    if (process.platform !== 'darwin' || !await systemPreferences.askForMediaAccess('microphone')) throw new Error('请在系统设置中允许麦克风访问');
    const binary = app.isPackaged ? path.join(process.resourcesPath,'native/speech-capture') : path.join(studio,'apps/desktop/dist/speech-capture');
    await access(binary);
    const engineRoot = app.isPackaged ? path.join(process.resourcesPath, 'native/speech-engine') : path.join(studio, 'apps/desktop/dist/speech-engine');
    try { await assertSpeechEngine(engineRoot); } catch { throw new Error('本地语音识别组件尚未就绪，请更新或重新安装客户端。'); }
    let ready;
    const started = new Promise(resolve => { ready = resolve; });
    const current = speechSession(binary, event => {
      if (event.event === 'ready') ready();
      else if (event.event === 'recording') {
        speechRecordings.set(sender, event.recordingPath);
        if (!sender.isDestroyed()) sender.send('desktop:speech-backup');
      } else if (!sender.isDestroyed()) {
        if (event.event === 'processing') sender.send('desktop:speech-ended');
        else if (event.event === 'progress') sender.send('desktop:speech-progress', event.percent);
        else if (event.event === 'level') sender.send('desktop:speech-level', event.level);
        else if (event.event === 'transcript') sender.send('desktop:speech-transcript', event.text);
        else if (event.event === 'warning') sender.send('desktop:speech-warning', event.message);
      }
    }, path.join(app.getPath('userData'), 'cache', 'speech-recordings'), (file, options) => transcribeRecording(file, engineRoot, options));
    current.owner = sender;
    speech = current;
    current.result.finally(() => { if (!sender.isDestroyed()) sender.send('desktop:speech-ended'); }).catch(() => {});
    try { await Promise.race([started, current.result.then(() => { throw new Error('录音已结束，请重试。'); })]); }
    catch (error) { if (speech === current) speech = undefined; current.cancel(); throw error; }
    } finally { speechStarting = false; }
  }, true);
  handle('desktop:speech-reveal', async sender => { const recording = speechRecordings.get(sender); if (recording) { await access(recording); shell.showItemInFolder(recording); } }, true);
  handle('desktop:speech-pause', async (sender, paused) => { if (!speech || speech.owner !== sender || typeof paused !== 'boolean') throw new Error('没有当前窗口的录音'); await speech.pause(paused); }, true);
  handle('desktop:speech-stop', async (discard = false) => { if (!speech) return ''; const current = speech; current.stop(discard === true); try { return await current.result; } finally { speech = undefined; } });
  handle('desktop:badge', (count) => { if (!Number.isInteger(count) || count < 0 || count > 9999) throw new Error('无效的数量'); app.dock?.setBadge(count ? String(count) : ''); });
  handle('desktop:notify', (payload) => {
    if (!payload || typeof payload.title !== 'string' || typeof payload.body !== 'string') throw new Error('无效的通知');
    const route = localRoute(payload.route);
    // The native process is authoritative: all renderer windows share this foreground gate.
    if (BrowserWindow.getFocusedWindow()) return;
    if (Notification.isSupported()) { const notification = new Notification({title:payload.title.slice(0,100),body:payload.body.slice(0,300)}); notification.on('click', () => openWindow(route)); notification.show(); }
  });
}
async function openExistingWorkspace() {
  const selection = await dialog.showOpenDialog({title:t('打开已有知识空间'), message:t('选择之前使用的知识空间文件夹。日记与笔记请使用“打开文件夹”。'), properties:['openDirectory'], securityScopedBookmarks:!!process.mas});
  if (selection.canceled) return;
  const root = selection.filePaths[0];
  await scopes.grant(root, selection.bookmarks?.[0], 'workspace');
  try { await access(path.join(root,'the-way-here.config.yaml')); }
  catch { dialog.showErrorBox(t('这不是已有的知识空间'), t('请选之前由 The Way Here 创建的知识空间。普通文档文件夹可以在应用的“资料”中连接。')); return; }
  await saveWorkspace(app.getPath('userData'), await realpath(root));
  app.relaunch(); app.quit();
}
function installMenu() {
  const action = (label,accelerator,value) => ({label:t(label),accelerator,click:() => command(value)});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'The Way Here',submenu:[{role:'about'},action('偏好设置…','CmdOrCtrl+,','settings'),{label:t('隐私与数据使用'),click:() => openWindow('/privacy','reader')},...(process.mas ? [{label:t('连接 Codex CLI…'),click:() => void connectCodex().catch(error => dialog.showErrorBox(t('未能连接 Codex'),error.message))}] : []),{type:'separator'},{role:'services'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
    {label:t('文件'),submenu:[{label:t('打开已有知识空间…'),click:() => void openExistingWorkspace()}, {type:'separator'},action('随手记','CmdOrCtrl+N','capture'),action('导入生活记录…','CmdOrCtrl+O','import'),action('在独立窗口打开','CmdOrCtrl+Return','detach'),action('深入聊聊','CmdOrCtrl+Shift+F','focus'),{type:'separator'},{role:'close'}]},
    {label:t('编辑'),submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}, {type:'separator'}, {role:'startSpeaking'},{role:'stopSpeaking'}]},
    {label:t('显示'),submenu:[action('搜索与命令','CmdOrCtrl+K','search'),action('AI 协作面板','CmdOrCtrl+Alt+I','inspector'),action('看见未来',undefined,'predict-self'),action('返回','CmdOrCtrl+[','back'),action('前进','CmdOrCtrl+]','forward'),{type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'},...(!app.isPackaged ? [{role:'toggleDevTools'}] : [])]},
    {label:t('知识库'),submenu:Array.from({length:9},(_,i) => ({label:t('打开知识库 ${n}', { n: i + 1 }),accelerator:`CmdOrCtrl+${i+1}`,click:() => command(`knowledge-base:${i+1}`)}))},
    {label:t('窗口'),submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}, {label:t('主窗口'),click:showMain}]},
  ]));
  if (!tray) {
    const trayPath = app.isPackaged ? path.join(process.resourcesPath,'native/trayTemplate.png') : path.join(studio,'apps/desktop/dist/trayTemplate.png');
    const image = nativeImage.createFromPath(trayPath);
    image.setTemplateImage(true);
    tray = new Tray(image);
    tray.setToolTip('The Way Here');
  }
  tray.setContextMenu(Menu.buildFromTemplate([{label:t('随手记'),click:() => openWindow('/capture','capture')},{label:t('打开 The Way Here'),click:showMain},{type:'separator'},{role:'quit'}]));
}
app.whenReady().then(async () => {
  setLocale(readPersistedLocale(path.join(app.getPath('userData'), 'locale.json')));
  if (app.isPackaged) {
    try { distribution = JSON.parse(await readFile(path.join(process.resourcesPath,'release-metadata.json'),'utf8')); }
    catch (error) { if (process.mas || error.code !== 'ENOENT') throw error; }
  }
  scopes = new ScopedAccess(app, app.getPath('userData'), !!process.mas);
  await scopes.restore();
  if (scopes.unavailable.length && !app.commandLine.hasSwitch('diagnostics')) await dialog.showMessageBox({type:'warning',message:t('部分目录需要重新授权'),detail:t('请通过“打开文件夹”重新选择失效目录。原始资料不会被删除。'),buttons:[t('继续')]});
  if (process.mas) masCodex = await prepareMasCodexHome(app.getPath('userData'));
  workspace = await chooseWorkspace(); if (!workspace) return app.quit();
  workspace = await realpath(workspace);
  runtimeClient = await startRuntime();
  origin = `https://workspace-${createHash('sha256').update(workspace).digest('hex').slice(0,20)}.localhost`;
  session.defaultSession.protocol.handle('https', async (request) => {
    if (!trustedSender(request.url,origin)) return net.fetch(request,{bypassCustomProtocolHandlers:true});
    const url = new URL(request.url);
    if (url.pathname === '/api/events') return request.method === 'GET' ? runtimeClient.events(request.signal) : new Response(null,{status:405});
    if (url.pathname.startsWith('/api/')) return runtimeClient.request(request);
    const webRoot = app.isPackaged ? path.join(process.resourcesPath,'web') : path.join(studio,'apps/web/dist');
    return assetResponse(request, webRoot, url => net.fetch(url));
  });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(trustedSender(contents?.getURL(),origin) && permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((contents, permission) => trustedSender(contents?.getURL(),origin) && permission === 'media');
  const iconPath = app.isPackaged ? path.join(process.resourcesPath,'native/app-icon.png') : path.join(studio,'apps/desktop/dist/app-icon.png');
  app.dock?.setIcon(nativeImage.createFromPath(iconPath));
  app.setAboutPanelOptions({ applicationName: 'The Way Here', iconPath });
  registerIPC(); installMenu(); openWindow('/','main');
}).catch(async (error) => { console.error('Desktop startup failed:',error); if (!app.commandLine.hasSwitch('diagnostics')) { const result = await dialog.showMessageBox({type:'error',message:t('暂时无法打开知识空间'),detail:error.message,buttons:[t('退出'),t('打开已有知识空间…')],defaultId:0,cancelId:0}); if (result.response === 1) await openExistingWorkspace(); } app.quit(); });
app.on('activate',showMain);
app.on('before-quit', () => { quitting = true; speech?.cancel(); for (const library of photoLibraries.values()) library.close(); photoLibraries.clear(); worker?.kill(); scopes?.close(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(() => { globalShortcut.register('CommandOrControl+Shift+N', () => { if (origin) openWindow('/capture', 'capture'); }); });
app.on('will-quit', () => globalShortcut.unregisterAll());
