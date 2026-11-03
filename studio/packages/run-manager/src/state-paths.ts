import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

function appStateRoot(): string {
  // Explicit acceptance runs must never share the user's persisted app state.
  // Vitest sets VITEST itself; ordinary desktop launches ignore this test option.
  const testRoot = process.env.VITEST && process.env.TWH_TEST_STATE_ROOT;
  if (testRoot) {
    if (!path.isAbsolute(testRoot)) throw new Error("测试状态目录必须是绝对路径");
    return path.resolve(testRoot);
  }
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "the-way-here");
  if (process.platform === "win32") return path.join(process.env.APPDATA || os.homedir(), "the-way-here");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "the-way-here");
}

export function stateRootForVault(vaultRoot: string): string {
  const key = createHash("sha256").update(path.resolve(vaultRoot)).digest("hex").slice(0, 16);
  return path.join(appStateRoot(), "vaults", key);
}


/** Desktop provides one app-owned cache root; standalone runs retain vault-local app state isolation. */
export function cacheRootForVault(vaultRoot: string): string {
  const shared = process.env.TWH_APP_CACHE_ROOT;
  if (!shared) return path.join(stateRootForVault(vaultRoot), "cache");
  if (!path.isAbsolute(shared)) throw new Error("应用缓存目录必须是绝对路径");
  return path.join(shared, "vaults", createHash("sha256").update(path.resolve(vaultRoot)).digest("hex").slice(0, 16));
}
