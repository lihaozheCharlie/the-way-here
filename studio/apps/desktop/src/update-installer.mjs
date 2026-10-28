// electron-updater verifies the ZIP checksum; Squirrel.Mac verifies the app's
// signing identity before replacing it. The renderer never supplies a URL/path.
export function createMacInstaller({ createUpdater, onError = () => {} } = {}) {
  let updater, cancellation, failed, reportProgress, disposed = false, downloaded = false;
  return {
    async download(version, artifact, progress) {
      if (disposed) throw new Error('Updater closed');
      cancellation?.cancel(); updater?.closeServerIfExists();
      const base = `https://github.com/lihaozheCharlie/the-way-here/releases/download/mac-v${version}/`;
      const make = createUpdater || (async options => { const { default: module } = await import('electron-updater'); return new module.MacUpdater(options); });
      const options = { provider:'generic', url:base, useMultipleRangeRequest:false };
      reportProgress = progress;
      if (!updater) {
        updater = await make(options);
        if (disposed) throw new Error('Updater closed');
        updater.on('error', error => { failed = error; onError(error); });
        updater.on('download-progress', event => reportProgress?.(event.percent));
      } else updater.setFeedURL(options);
      updater.autoDownload = false; updater.autoInstallOnAppQuit = false; updater.autoRunAppAfterInstall = true;
      updater.allowDowngrade = false; updater.allowPrerelease = false; updater.disableDifferentialDownload = true;
      failed = undefined; downloaded = false;
      const result = await updater.checkForUpdates();
      if (disposed) throw new Error('Updater closed');
      if (!result || result.updateInfo.version !== version) throw new Error('Update version changed');
      cancellation = result.cancellationToken;
      const files = result.updateInfo.files.filter(file => new URL(file.url, base).pathname.endsWith('.zip'));
      if (files.length !== 1 || new URL(files[0].url, base).href !== base + artifact.filename || files[0].sha512 !== artifact.sha512 || files[0].size !== artifact.size) throw new Error('Update metadata mismatch');
      await updater.downloadUpdate(cancellation);
      if (failed) throw failed;
      downloaded = true;
    },
    install() { if (disposed || !updater || !downloaded) throw new Error('Update unavailable'); failed = undefined; updater.quitAndInstall(); },
    dispose() { disposed = true; cancellation?.cancel(); updater?.closeServerIfExists(); updater?.removeAllListeners(); updater?.on('error', () => {}); },
  };
}
