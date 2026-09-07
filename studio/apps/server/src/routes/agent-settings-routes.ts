import type { FastifyInstance } from "fastify";
import type { UpdateAgentGlobalSettings } from "@the-way-here/shared";
import type { AgentRuntimeSettings } from "../runtime/agent-runtime/types.js";
import type { StudioEvents } from "../runtime/studio-events.js";
import { AgentSettingsValidationError } from "../runtime/agent-runtime/agent-settings-store.js";

export function registerAgentSettingsRoutes(app: FastifyInstance, settings: AgentRuntimeSettings, events: StudioEvents): void {
  app.get("/api/agent-runtimes", async () => settings.catalog());
  app.get("/api/agent-models", async () => (await settings.catalog()).flatMap((runtime) => runtime.models));
  app.get("/api/agent-provider-presets", async () => settings.providerPresets());
  app.get("/api/agent-settings", async () => settings.settings());
  app.put<{ Body: UpdateAgentGlobalSettings }>("/api/agent-settings", async (request, reply) => {
    try {
      const updated = await settings.updateSettings(request.body);
      events.broadcast("agent-settings", updated);
      return updated;
    } catch (error) {
      if (error instanceof AgentSettingsValidationError) return reply.code(400).send({ error: error.message });
      throw error;
    }
  });
}
