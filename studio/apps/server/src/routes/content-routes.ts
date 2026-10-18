import type { FastifyInstance } from "fastify";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import type { AgentRuntimeDescriptor } from "@the-way-here/shared";
import { registerKnowledgeBaseRoutes } from "./knowledge-base-routes.js";
import { registerPageRoutes } from "./page-routes.js";
import { registerCaptureRoutes } from "./capture-routes.js";
import { registerSkillRoutes } from "./skill-routes.js";
import { registerViewRoutes } from "./view-routes.js";

export type ContentRouteServices = {
  runtimeCatalog: () => Promise<AgentRuntimeDescriptor[]>;
  hasActiveKnowledgeBaseRun: (knowledgeBaseId: string) => Promise<boolean>;
};

/** Compose content APIs shared by the HTTP host and the private desktop host. */
export function registerContentRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, services: ContentRouteServices): void {
  registerKnowledgeBaseRoutes(app, knowledge, services.runtimeCatalog, services.hasActiveKnowledgeBaseRun);
  registerPageRoutes(app, knowledge, services.hasActiveKnowledgeBaseRun);
  registerCaptureRoutes(app, knowledge, services.hasActiveKnowledgeBaseRun);
  registerSkillRoutes(app, knowledge);
  registerViewRoutes(app, knowledge);
}
