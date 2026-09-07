import Fastify from "fastify";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadVaultConfig } from "@the-way-here/wiki-core";
import { AgentSettingsStore } from "../runtime/agent-runtime/agent-settings-store.js";
import type { AgentRuntimeSettings } from "../runtime/agent-runtime/types.js";
import { StudioEvents } from "../runtime/studio-events.js";
import { registerAgentSettingsRoutes } from "./agent-settings-routes.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-settings-route-"));
  await mkdir(path.join(root, "state"));
  const store = new AgentSettingsStore((await loadVaultConfig(root)).agents, root, path.join(root, "state"));
  let snapshot = await store.load();
  const settings: AgentRuntimeSettings = {
    catalog: async () => [{ id: "codex", displayName: "Codex", available: true, models: [] }],
    providerPresets: () => [],
    settings: () => snapshot.public,
    updateSettings: async (input) => { snapshot = await store.update(input); return snapshot.public; },
  };
  const events = new StudioEvents();
  const broadcast = vi.spyOn(events, "broadcast");
  const app = Fastify();
  registerAgentSettingsRoutes(app, settings, events);
  cleanup.push(async () => { await app.close(); await rm(root, { recursive: true, force: true }); });
  return { app, broadcast };
}

describe("independent agent settings routes", () => {
  it("serves settings and model discovery without a task coordinator", async () => {
    const { app } = await fixture();
    for (const url of ["/api/agent-settings", "/api/agent-runtimes", "/api/agent-models", "/api/agent-provider-presets"]) {
      expect((await app.inject({ url })).statusCode).toBe(200);
    }
  });

  it("persists a valid update and broadcasts only its public settings", async () => {
    const { app, broadcast } = await fixture();
    const current = (await app.inject({ url: "/api/agent-settings" })).json();
    const response = await app.inject({ method: "PUT", url: "/api/agent-settings", payload: { ...current, runtimeId: "codex", codex: { model: "test-model", effort: "high" }, thirdParty: { ...current.thirdParty, apiKey: "test-only-secret" } } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ runtimeId: "codex", codex: { model: "test-model", effort: "high" } });
    expect(broadcast).toHaveBeenCalledWith("agent-settings", response.json());
    expect(response.body).not.toContain("test-only-secret");
    expect((await app.inject({ url: "/api/agent-settings" })).json()).toEqual(response.json());
  });

  it("returns validation errors without publishing a settings change", async () => {
    const { app, broadcast } = await fixture();
    const before = (await app.inject({ url: "/api/agent-settings" })).json();
    const response = await app.inject({ method: "PUT", url: "/api/agent-settings", payload: { runtimeId: "unknown" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty("error");
    expect(broadcast).not.toHaveBeenCalled();
    expect((await app.inject({ url: "/api/agent-settings" })).json()).toEqual(before);
  });
});
