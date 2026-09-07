import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

function appStateRoot(): string {
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "the-way-here");
  if (process.platform === "win32") return path.join(process.env.APPDATA || os.homedir(), "the-way-here");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "the-way-here");
}

export function stateRootForVault(vaultRoot: string): string {
  const key = createHash("sha256").update(path.resolve(vaultRoot)).digest("hex").slice(0, 16);
  return path.join(appStateRoot(), "vaults", key);
}

