import type { FastifyInstance, FastifyReply } from "fastify";
import { DreamInputError, parseDreamPointDescription, parseDreamStart } from "@the-way-here/life-views";
import { DreamBusyError, DreamRuntimeError, type DreamService } from "../runtime/dreams/dream-service.js";
import { isDreamRunId } from "../modules/dreams/dream-store.js";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";

export function registerDreamRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, dreams: DreamService) {
  function library(id: unknown, reply: FastifyReply): string | undefined {
    if (typeof id !== "string" || !id.trim()) {
      reply.code(400).send({ error: "请指定知识库" });
      return;
    }
    if (!knowledge.index.config.knowledgeBases.some(base => base.id === id)) {
      reply.code(404).send({ error: "知识库不存在" });
      return;
    }
    return id;
  }

  async function action<T>(reply: FastifyReply, operation: () => Promise<T>): Promise<T | FastifyReply> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof DreamInputError) return reply.code(400).send({ error: error.message });
      if (error instanceof DreamBusyError) return reply.code(409).send({ error: error.message });
      if (error instanceof DreamRuntimeError) return reply.code(503).send({ error: error.message });
      throw error;
    }
  }

  type Query = { knowledgeBaseId?: string };
  type RunRoute = { Params: { id: string }; Querystring: Query };
  app.get<{ Querystring: Query }>("/api/dreams/points", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (id) return { knowledgeBaseId: id, points: await dreams.candidates(id) };
  });
  app.get<{ Querystring: Query }>("/api/dreams/workspace", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (id) return { knowledgeBaseId: id, ...await dreams.workspacePoints(id) };
  });
  app.post<{ Querystring: Query }>("/api/dreams/discover", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (id) return { points: await dreams.discover(id) };
  });
  app.post<{ Querystring: Query; Body: unknown }>("/api/dreams/points", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (id) return action(reply, async () => dreams.describe(id, parseDreamPointDescription(request.body)));
  });
  app.post<{ Querystring: Query; Body: { key?: unknown; preference?: unknown } }>("/api/dreams/points/preference", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (!id) return;
    const { key, preference } = request.body ?? {};
    if (typeof key !== "string" || key.length > 2000 || !/^(life-stage|decision|self-described|conversation):.+$/.test(key)
      || (preference !== "saved" && preference !== "ignored" && preference !== null)) {
      return reply.code(400).send({ error: "请选择有效的入梦点和操作" });
    }
    const result = await dreams.setPointPreference(id, key, preference);
    return result || reply.code(404).send({ error: "入梦点不存在" });
  });
  app.post<{ Body: unknown }>("/api/dreams/environment", (request, reply) => action(reply, async () => {
    const input = parseDreamStart(request.body);
    if (library(input.knowledgeBaseId, reply)) return dreams.environment(input);
    return reply;
  }));
  app.post<{ Body: unknown }>("/api/dreams/suggestions", (request, reply) => action(reply, async () => {
    const input = parseDreamStart(request.body);
    if (!library(input.knowledgeBaseId, reply)) return reply;
    const controller = new AbortController();
    const cancel = () => controller.abort(new Error("已离开入梦准备"));
    reply.raw.once("close", cancel);
    try { return { suggestions: await dreams.recommend(input, controller.signal) }; }
    finally { reply.raw.removeListener("close", cancel); }
  }));
  app.get<{ Querystring: Query }>("/api/dreams", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (id) return { knowledgeBaseId: id, runs: await dreams.list(id) };
  });
  app.post<{ Body: unknown }>("/api/dreams", (request, reply) => action(reply, async () => {
    const input = parseDreamStart(request.body);
    if (!library(input.knowledgeBaseId, reply)) return reply;
    const run = await dreams.start(input);
    return reply.code(run.status === "queued" || run.status === "running" ? 202 : 200).send(run);
  }));
  app.get<RunRoute>("/api/dreams/:id", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (!id) return;
    const run = isDreamRunId(request.params.id) && await dreams.get(id, request.params.id);
    return run || reply.code(404).send({ error: "梦境不存在" });
  });
  app.delete<RunRoute>("/api/dreams/:id", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (!id) return;
    const deleted = isDreamRunId(request.params.id) && await dreams.delete(id, request.params.id);
    return deleted ? { deleted: true } : reply.code(404).send({ error: "梦境不存在" });
  });
  app.post<RunRoute>("/api/dreams/:id/cancel", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (!id) return;
    const run = isDreamRunId(request.params.id) && await dreams.cancel(id, request.params.id);
    return run || reply.code(404).send({ error: "梦境不存在" });
  });
  app.post<RunRoute>("/api/dreams/:id/resume", (request, reply) => action(reply, async () => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (!id) return reply;
    const result = isDreamRunId(request.params.id) && await dreams.resume(id, request.params.id);
    return result || reply.code(404).send({ error: "没有可以继续的梦境" });
  }));
  app.post<RunRoute & { Body: { on?: unknown } }>("/api/dreams/:id/favorite", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (!id) return;
    const on = request.body?.on;
    if (typeof on !== "boolean") return reply.code(400).send({ error: "请选择是否收藏" });
    const result = isDreamRunId(request.params.id) && await dreams.favorite(id, request.params.id, on);
    return result || reply.code(404).send({ error: "梦境不存在" });
  });
  app.post<RunRoute & { Body: { key?: unknown } }>("/api/dreams/:id/insights", async (request, reply) => {
    const id = library(request.query.knowledgeBaseId, reply);
    if (!id) return;
    const key = request.body?.key;
    if (typeof key !== "number" || !Number.isInteger(key) || key < 0) return reply.code(400).send({ error: "请选择要收藏的洞察" });
    const result = isDreamRunId(request.params.id) && await dreams.insight(id, request.params.id, key);
    return result || reply.code(404).send({ error: "洞察不存在" });
  });
}
