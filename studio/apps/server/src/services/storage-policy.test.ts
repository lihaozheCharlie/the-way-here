import { expect, it, vi, afterEach } from "vitest";
import { storagePolicy } from "./storage-policy.js";
import type { VaultConfig } from "@the-way-here/shared";
const config = { knowledgeBaseId: "demo", paths: { wiki: "demo/wiki", sources: "demo/sources" } } as VaultConfig;
afterEach(() => vi.unstubAllEnvs());
it("isolates cache per workspace and fails closed for drafts, settings, knowledge and unknown files", () => {
  vi.stubEnv("TWH_APP_CACHE_ROOT", "/tmp/anonymous-app/cache");
  const policy = storagePolicy("/tmp/anonymous-a", config);
  expect(policy.cacheRoot).not.toBe(storagePolicy("/tmp/anonymous-b", config).cacheRoot);
  expect(policy.unknownPaths).toBe("protected");
  for (const id of ["user-preferences", "capture-state", "runs", "app-state", "knowledge", "sources", "desktop-state"]) expect(policy.categories.find(item => item.id === id)?.retention).toBe("protected");
  expect(policy.categories.find(item => item.id === "speech-input")?.retention).toBe("conditional");
  expect(policy.categories.find(item => item.id === "speech-conversion")?.location).toBe("/tmp/anonymous-app/cache/speech-recordings/*/recognition-input.wav");
  expect(policy.categories.filter(item => item.retention === "rebuildable").map(item => item.id)).toEqual(["speech-conversion"]);
});
