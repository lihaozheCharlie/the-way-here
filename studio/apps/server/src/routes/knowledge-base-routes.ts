import type { FastifyInstance } from "fastify";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import type { AgentRuntimeDescriptor } from "@the-way-here/shared";
import { storagePolicy } from "../services/storage-policy.js";
import { CompanionshipStore } from "../runtime/companionship-store.js";
import { KnowledgeBaseRequestError } from "../modules/knowledge-bases/knowledge-base-manager.js";

export function registerKnowledgeBaseRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, runtimeCatalog: () => Promise<AgentRuntimeDescriptor[]>, hasActiveKnowledgeBaseRun: (knowledgeBaseId: string) => Promise<boolean>): void {
  app.get("/api/storage/policy", async () => storagePolicy(knowledge.vaultRoot, knowledge.index.config));
  app.get("/api/health", async () => ({ ok: true, vaultRoot: knowledge.vaultRoot, indexedAt: knowledge.index.lastIndexedAt }));
  const companionship = new CompanionshipStore(knowledge.vaultRoot);
  app.get("/api/vault", async () => {
    const vault = knowledge.vaultInfo();
    const [runtimes, companionshipStartedAt] = await Promise.all([runtimeCatalog(), companionship.startedAt(vault.knowledgeBaseId)]);
    return { ...vault, runtimes, agentAvailable: runtimes.some(runtime => runtime.available), companionshipStartedAt };
  });
  app.post<{ Body: { name?: string } }>("/api/vault", async (request, reply) => {
    try {
      const created = await knowledge.createKnowledgeBase(request.body?.name);
      return reply.code(201).send({ ...created, knowledgeBaseId: created.id });
    } catch (error) {
      if (error instanceof KnowledgeBaseRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.patch<{ Params: { knowledgeBaseId: string }; Body: { name?: unknown } }>("/api/vault/:knowledgeBaseId", async (request, reply) => {
    try { return await knowledge.renameKnowledgeBase(request.params.knowledgeBaseId, request.body?.name); }
    catch (error) { if (error instanceof KnowledgeBaseRequestError) return reply.code(error.statusCode).send({ error:error.message }); throw error; }
  });
  app.delete<{ Params: { knowledgeBaseId: string } }>("/api/vault/:knowledgeBaseId", async (request, reply) => {
    try {
      if (await hasActiveKnowledgeBaseRun(request.params.knowledgeBaseId)) return reply.code(409).send({ error: "这个知识库还有 Agent 任务正在运行，请结束任务后再删除" });
      return await knowledge.deleteKnowledgeBase(request.params.knowledgeBaseId);
    } catch (error) {
      if (error instanceof KnowledgeBaseRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.post<{ Body: { knowledgeBaseId?: string } }>("/api/vault/select", async (request, reply) => {
    const nextId = request.body?.knowledgeBaseId?.trim();
    if (!nextId) return reply.code(400).send({ error: "请选择要打开的知识库" });
    try {
      await knowledge.activate(nextId);
      return { ok: true, knowledgeBaseId: knowledge.index.config.knowledgeBaseId };
    } catch (error: any) {
      return reply.code(404).send({ error: error.message || "知识库不存在" });
    }
  });
}
