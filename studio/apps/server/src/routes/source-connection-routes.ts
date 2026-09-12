import type { FastifyInstance } from "fastify";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import type { SourceConnections } from "../runtime/source-connections.js";
import { KnowledgeBaseRequestError } from "../modules/knowledge-bases/knowledge-base-manager.js";

export function registerSourceConnectionRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, connections: SourceConnections) {
  app.get("/api/source-connections", () => connections.list(knowledge.index.config.knowledgeBaseId));
  for (const method of ["POST", "PATCH", "DELETE"] as const) app.route<{ Params: { id?: string }; Body: { knowledgeBaseId?: unknown; path?: unknown; autoBuild?: unknown } }>({
    method, url: method === "POST" ? "/api/source-connections" : "/api/source-connections/:id",
    handler: async (request, reply) => {
      try {
        const id = request.body?.knowledgeBaseId;
        if (id !== knowledge.index.config.knowledgeBaseId) throw new KnowledgeBaseRequestError(409, "知识库已切换，请重新打开目录连接");
        if (method === "POST") return await connections.connect(id as string, request.body.path, request.body.autoBuild);
        if (method === "PATCH") return await connections.update(id as string, request.params.id!, request.body.autoBuild);
        return await connections.disconnect(id as string, request.params.id!);
      } catch (error) {
        if (error instanceof KnowledgeBaseRequestError) return reply.code(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  });
  app.post<{ Params: { id: string }; Body: { knowledgeBaseId?: unknown } }>("/api/source-connections/:id/sync", async (request, reply) => {
    try {
      if (request.body?.knowledgeBaseId !== knowledge.index.config.knowledgeBaseId) throw new KnowledgeBaseRequestError(409, "知识库已切换，请重新打开目录连接");
      return await connections.sync(request.body.knowledgeBaseId as string, request.params.id);
    } catch (error) {
      if (error instanceof KnowledgeBaseRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
}
