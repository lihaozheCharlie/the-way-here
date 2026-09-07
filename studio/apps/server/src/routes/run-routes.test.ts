import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunCoordinator } from "../runtime/run-coordinator.js";
import { RunRequestError } from "../runtime/run-coordinator.js";
import { registerRunRoutes } from "./run-routes.js";

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe("run history routes", () => {
  it("deletes the whole conversation that owns a run", async () => {
    const app = Fastify();
    apps.push(app);
    const deleteConversation = vi.fn(async () => ({ threadId: "session-1", deletedRunIds: ["run-1", "run-2"] }));
    registerRunRoutes(app, { deleteConversation } as unknown as RunCoordinator);

    const response = await app.inject({ method: "DELETE", url: "/api/runs/run-2" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ threadId: "session-1", deletedRunIds: ["run-1", "run-2"] });
    expect(deleteConversation).toHaveBeenCalledWith("run-2");
  });

  it("reports active conversations as a conflict", async () => {
    const app = Fastify();
    apps.push(app);
    const deleteConversation = vi.fn(async () => { throw new RunRequestError(409, "这段对话仍在进行，请先结束后再删除"); });
    registerRunRoutes(app, { deleteConversation } as unknown as RunCoordinator);

    const response = await app.inject({ method: "DELETE", url: "/api/runs/run-1" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "这段对话仍在进行，请先结束后再删除" });
  });
});
