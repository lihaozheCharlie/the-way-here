import path from "node:path";
import { homedir } from "node:os";
import { toPosix } from "./page-paths.js";
import type { VaultConfig } from "@the-way-here/shared";

/** Absolute base for user content: `paths.wiki` / `paths.sources` and the
 * derived predictions directory resolve against it. Defaults to the workspace
 * root so existing workspaces behave exactly as before. */
export function contentBase(vaultRoot: string, config: VaultConfig): string {
  const configured = config.storage?.contentRoot;
  return configured ? path.resolve(configured) : path.resolve(vaultRoot);
}

/** Resolve a content-relative path (page relativePath, KB path…) to disk. */
export function resolveContentPath(vaultRoot: string, config: VaultConfig, relativePath: string): string {
  return path.resolve(contentBase(vaultRoot, config), toPosix(relativePath));
}

/** True when `absolutePath` is the content base itself or lies inside it. */
export function isInsideContentBase(vaultRoot: string, config: VaultConfig, absolutePath: string): boolean {
  const base = contentBase(vaultRoot, config);
  const resolved = path.resolve(absolutePath);
  return resolved === base || resolved.startsWith(`${base}${path.sep}`);
}

/** Expand a leading `~` so users can paste Home-relative paths from Finder. */
export function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return path.join(homedir(), value.slice(2));
  return value;
}
