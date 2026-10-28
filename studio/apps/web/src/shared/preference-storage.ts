const cached = new Map<string, string | null>();
let owner: object | undefined;
let unsubscribe: (() => void) | undefined;
function prepare() {
  const desktop = typeof window !== "undefined" ? window.desktop : undefined;
  if (owner !== desktop) {
    unsubscribe?.(); cached.clear(); owner = desktop;
    unsubscribe = desktop?.onPreferenceChange?.(key => {
      cached.delete(key);
      window.dispatchEvent(new Event("desktop-preference"));
    });
  }
  return desktop;
}
/** Desktop preferences survive browser-origin and app-version changes.
 * Browser-only sessions retain their existing local storage behavior.
 * Import only an existing choice; never persist a component's default. */
export function readPreference(key: string): string | null {
  const desktop = prepare();
  if (desktop?.readPreference) {
    if (cached.has(key)) return cached.get(key)!;
    const value = desktop.readPreference(key);
    if (value !== null) { cached.set(key, value); return value; }
    const legacy = localStorage.getItem(key);
    if (legacy !== null) { const imported = desktop.writePreference!(key, legacy, "legacy-import"); cached.set(key, imported); return imported; }
    cached.set(key, null);
    return null;
  }
  return localStorage.getItem(key);
}
export function writePreference(key: string, value: string): void {
  const desktop = prepare();
  const persisted = desktop?.writePreference ? desktop.writePreference(key, value, "user") : value;
  cached.set(key, persisted);
  try { localStorage.setItem(key, persisted); }
  catch (error) { if (!desktop?.writePreference) throw error; }
}
