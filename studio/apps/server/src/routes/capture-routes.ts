import type { FastifyInstance } from "fastify";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import { CaptureHistoryStore } from "../modules/content/capture-history-store.js";
import { ContentRequestError, PageWriter } from "../modules/content/page-writer.js";
import { bindContentWorkspace } from "../modules/content/content-workspace.js";
import { ImportStore } from "../modules/imports/import-store.js";
import { handleContent } from "./content-errors.js";

export function registerCaptureRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, hasActiveKnowledgeBaseRun: (knowledgeBaseId: string) => Promise<boolean>): void {
  const captures = new CaptureHistoryStore(knowledge.vaultRoot);
  app.get<{ Querystring: { knowledgeBaseId?: string } }>("/api/capture/history", async (request, reply) => handleContent(reply, async () => {
    if (request.query.knowledgeBaseId !== knowledge.index.config.knowledgeBaseId) throw new ContentRequestError(409, "知识库已切换，请重新打开随手记");
    const boundIndex = knowledge.index;
    await captures.importCompleted(request.query.knowledgeBaseId, boundIndex);
    const { entries, defaultFolder } = await captures.list(request.query.knowledgeBaseId);
    return { entries, defaultFolder };
  }));
  app.put<{ Body: { knowledgeBaseId?: unknown } }>("/api/capture/draft", async (request, reply) => handleContent(reply, async () => {
    const id = knowledge.index.config.knowledgeBaseId;
    if (request.body?.knowledgeBaseId !== id) throw new ContentRequestError(409, "知识库已切换，草稿仍已留在本机");
    return captures.put(id, request.body);
  }));
  app.put<{ Body: { knowledgeBaseId?: unknown; folder?: unknown } }>("/api/capture/default-folder", async (request, reply) => handleContent(reply, async () => {
    const id = knowledge.index.config.knowledgeBaseId;
    if (request.body?.knowledgeBaseId !== id) throw new ContentRequestError(409, "知识库已切换，请重试");
    return captures.setDefault(id, request.body?.folder);
  }));
  app.delete<{ Params: { id: string }; Body: { knowledgeBaseId?: unknown; revision?: unknown } }>("/api/capture/history/:id", async (request, reply) => handleContent(reply, async () => {
    const id = knowledge.index.config.knowledgeBaseId;
    if (request.body?.knowledgeBaseId !== id) throw new ContentRequestError(409, "知识库已切换，请重试");
    if (await hasActiveKnowledgeBaseRun(id)) throw new ContentRequestError(409, "请等整理完成后再删除历史记录");
    return captures.remove(id, request.params.id, request.body?.revision);
  }));
  app.post<{ Body: { title?: string; markdown?: string; knowledgeBaseId?: string } }>("/api/capture", async (request, reply) => handleContent(reply, async () => {
    const body = request.body;
    if (!body || typeof body.title !== "string" || body.title.length > 180 || /[\\/]/.test(body.title) || typeof body.markdown !== "string" || !body.markdown.trim() || body.markdown.length > 200_000) return reply.code(400).send({ error: "请填写有效的记录标题和正文" });
    if (body.knowledgeBaseId !== knowledge.index.config.knowledgeBaseId) return reply.code(409).send({ error: "知识库已经切换，请重新打开随手记后保存" });
    const boundWorkspace = bindContentWorkspace(knowledge);
    const boundWriter = new PageWriter(boundWorkspace);
    const page = await boundWriter.createSource(body.title, "随手记", body.markdown);
    if (page) await new ImportStore(boundWorkspace).trackCreatedSource(page);
    return page;
  }, 201));
}
