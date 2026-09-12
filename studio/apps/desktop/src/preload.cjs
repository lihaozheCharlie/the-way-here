const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  chooseSourceDirectory: () => ipcRenderer.invoke('desktop:choose-source-directory'),
  openWindow: (route, kind) => ipcRenderer.invoke('desktop:window', route, kind),
  onCommand: (callback) => { const listener = (_event, command) => callback(command); ipcRenderer.on('desktop:command', listener); return () => ipcRenderer.removeListener('desktop:command', listener); },
  notify: (payload) => ipcRenderer.invoke('desktop:notify', payload),
  setBadge: (count) => ipcRenderer.invoke('desktop:badge', count),
  revealWorkspace: () => ipcRenderer.invoke('desktop:reveal'),
  startSpeech: () => ipcRenderer.invoke('desktop:speech-start'),
  stopSpeech: () => ipcRenderer.invoke('desktop:speech-stop'),
});
