// This feed is an asset of the latest published release, so drafts stay invisible.
export const UPDATE_FEED_URL = 'https://github.com/lihaozheCharlie/the-way-here/releases/latest/download/update.json';
const versionParts = value => {
  if (typeof value !== 'string' || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(value)) throw new Error('Invalid stable version');
  return value.split('.').map(Number);
};
export function compareVersions(left, right) {
  const a = versionParts(left), b = versionParts(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  return 0;
}
const systemParts = value => {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(value)) throw new Error('Invalid macOS version');
  return [...value.split('.'), '0', '0'].slice(0, 3).join('.');
};
export function validateUpdateFeed(feed, arch) {
  if (!feed || feed.schemaVersion !== 1) throw new Error('Invalid update feed');
  versionParts(feed.version);
  const item = feed.downloads?.[arch];
  if (!['arm64','x64'].includes(arch) || !item) return null;
  const url = new URL(item.url);
  const expectedPath = `/lihaozheCharlie/the-way-here/releases/download/mac-v${feed.version}/The-Way-Here-${feed.version}-${arch}.dmg`;
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.pathname !== expectedPath || url.search || url.hash) throw new Error('Invalid update download');
  if (!Number.isSafeInteger(item.size) || item.size <= 0 || item.size > 2_000_000_000 || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid update artifact');
  systemParts(item.minimumSystemVersion);
  const notes = feed.notes ?? {};
  if (typeof notes !== 'object' || Array.isArray(notes) || ['zh','en'].some(locale => notes[locale] !== undefined && (typeof notes[locale] !== 'string' || notes[locale].length > 4000))) throw new Error('Invalid release notes');
  if (item.installer && (item.installer.filename !== `The-Way-Here-${feed.version}-${arch}.zip` || !Number.isSafeInteger(item.installer.size) || item.installer.size <= 0 || item.installer.size > 2_000_000_000 || typeof item.installer.sha512 !== 'string' || Buffer.from(item.installer.sha512, 'base64').length !== 64 || Buffer.from(item.installer.sha512, 'base64').toString('base64') !== item.installer.sha512)) throw new Error('Invalid automatic update artifact');
  return { version: feed.version, notes: { zh:notes.zh || '', en:notes.en || '' }, url:url.href, size:item.size, minimumSystemVersion:item.minimumSystemVersion, ...(item.installer ? { installer:item.installer } : {}) };
}
async function readFeed(response) {
  if (!response.ok || !response.body) throw new Error('Update request failed');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) throw new Error('Update feed too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export class UpdateChecker {
  #fetch; #arch; #systemVersion; #onChange; #pending; #controller; #download; #disposed = false;
  #installer; #artifact; #transfer; #installAttempt; #canInstall;
  constructor({ version, arch, systemVersion, enabled = true, fetch, onChange = () => {}, installer, canInstall = async () => true }) {
    this.#fetch = fetch; this.#arch = arch; this.#systemVersion = systemVersion; this.#onChange = onChange;
    this.state = { version, status:enabled ? 'idle' : 'disabled' };
    this.#installer = installer; this.#canInstall = canInstall;
  }
  #publish(state) { if (!this.#disposed) { this.state = state; this.#onChange(this.state); } return this.state; }
  check() {
    if (this.state.status === 'disabled' || this.#disposed) return Promise.resolve(this.state);
    if (['downloading','ready','installing','install-error'].includes(this.state.status)) return Promise.resolve(this.state);
    if (this.#pending) return this.#pending;
    const version = this.state.version;
    this.#publish({ version, status:'checking' }); this.#download = undefined;
    this.#controller = new AbortController();
    this.#pending = (async () => {
      try {
        const response = await this.#fetch(UPDATE_FEED_URL, { signal:AbortSignal.any([this.#controller.signal, AbortSignal.timeout(15_000)]), cache:'no-store', redirect:'follow' });
        const latest = validateUpdateFeed(await readFeed(response), this.#arch);
        if (!latest) return this.#publish({ version, status:'unsupported' });
        if (compareVersions(latest.version, version) <= 0) return this.#publish({ version, status:'current' });
        const { url, installer, ...details } = latest;
        this.#artifact = installer;
        const compatible = compareVersions(systemParts(this.#systemVersion), systemParts(latest.minimumSystemVersion)) >= 0;
        if (compatible && !this.#disposed) this.#download = url;
        return this.#publish({ ...details, latestVersion:latest.version, version, status:compatible ? 'available' : 'incompatible' });
      } catch { return this.#publish({ version, status:'error' }); }
      finally { this.#pending = undefined; }
    })();
    return this.#pending;
  }
  downloadURL() {
    if (this.#disposed || this.state.status !== 'available' || !this.#download) throw new Error('没有可下载的更新，请先检查更新。');
    return this.#download;
  }
  download() {
    if (this.#transfer) return this.#transfer;
    if (this.#disposed || !['available','download-error'].includes(this.state.status) || !this.#installer || !this.#artifact) return Promise.reject(new Error('当前版本暂不支持自动安装，请稍后检查更新。'));
    this.#publish({ ...this.state, status:'downloading', progress:0 });
    this.#transfer = (async () => {
      try {
        await this.#installer.download(this.state.latestVersion, this.#artifact, progress => {
          if (this.state.status === 'downloading' && Number.isFinite(progress)) this.#publish({ ...this.state, progress:Math.max(0, Math.min(100, progress)) });
        });
        if (this.#disposed) return;
        this.#publish({ ...this.state, status:'ready', progress:100 });
      } catch (error) {
        this.#publish({ ...this.state, status:'download-error', progress:undefined }); throw error;
      } finally { this.#transfer = undefined; }
    })();
    return this.#transfer;
  }
  installWhenReady() {
    if (this.#installAttempt) return this.#installAttempt;
    if (this.#disposed || !['ready','install-error'].includes(this.state.status)) return Promise.resolve(false);
    this.#installAttempt = (async () => {
      try {
        if (!await this.#canInstall() || this.#disposed) return false;
        this.#publish({ ...this.state, status:'installing' });
        await this.#installer.install(); return true;
      } catch { this.installationFailed(); return false; }
      finally { this.#installAttempt = undefined; }
    })();
    return this.#installAttempt;
  }
  installationFailed() { if (this.state.status === 'installing') this.#publish({ ...this.state, status:'install-error' }); }
  dispose() { this.#disposed = true; this.#controller?.abort(); this.#installer?.dispose(); this.#download = undefined; }
}
