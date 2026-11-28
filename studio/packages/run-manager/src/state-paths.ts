import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

let autoTestRoot: string | undefined;

function appStateRoot(): string {
  // Tests must never share the user's persisted app state: every entry under
  // Application Support looks like a real library to the product.
  // Vitest sets VITEST itself; ordinary desktop launches ignore this option.
  if (process.env.VITEST) {
    const explicit = process.env.TWH_TEST_STATE_ROOT;
    if (explicit) {
      if (!path.isAbsolute(explicit)) throw new Error("测试状态目录必须是绝对路径");
      return path.resolve(explicit);
    }
    // A test run that skips the runner (pnpm --filter <pkg> test) still gets its
    // own root, so nothing lands in the user's real directory.
    autoTestRoot ??= mkdtempSync(path.join(os.tmpdir(), "twh-test-state-"));
    return autoTestRoot;
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
