import type { FastifyInstance } from "fastify";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import type { PageCategory } from "@the-way-here/shared";
import { buildCards, buildFocusWorkspace, buildGraph, buildLetters, buildLifeMap, buildMentalModels, buildQuotes, buildRelationships, buildTimeline, buildToday } from "@the-way-here/life-views";
import { PhotoMemoryStore } from "../modules/imports/photo-memory-store.js";

export function registerViewRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime): void {
  app.get("/api/views/today", async () => buildToday(knowledge.index));
  app.get("/api/views/focus/:signalId", async (request, reply) => {
    const view = buildFocusWorkspace(knowledge.index, decodeURIComponent((request.params as { signalId: string }).signalId));
    return view || reply.code(404).send({ error: "当前没有可展开的状态问题" });
  });
  app.get("/api/views/timeline", async () => buildTimeline(knowledge.index));
  app.get("/api/views/life-map", async () => buildLifeMap(knowledge.index));
  app.get("/api/views/relationships", async () => {
    const index = knowledge.index;
    return new PhotoMemoryStore(knowledge.vaultRoot).decorate(index.config, buildRelationships(index), index);
  });
  app.get("/api/views/letters", async () => buildLetters(knowledge.index));
  app.get("/api/views/graph", async (request) => buildGraph(knowledge.index, 120, (request.query as { focus?: string }).focus));
  app.get("/api/views/mental-models", async (_request, reply) => buildMentalModels(knowledge.index) || reply.code(404).send({ error: "暂无思维模型页面" }));
  app.get("/api/views/quotes", async (_request, reply) => buildQuotes(knowledge.index) || reply.code(404).send({ error: "暂无金句页面" }));
  app.get<{ Params: { category: PageCategory } }>("/api/views/cards/:category", async (request) => buildCards(knowledge.index, request.params.category));
}
