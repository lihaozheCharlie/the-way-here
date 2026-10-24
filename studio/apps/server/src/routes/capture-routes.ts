import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import { CaptureHistoryStore, captureFolder } from "../modules/content/capture-history-store.js";
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
  app.post<{ Body: { knowledgeBaseId?: unknown; id?: unknown; revision?: unknown; text?: unknown; folder?: unknown; diaryDate?: unknown } }>("/api/capture/original", async (request, reply) => handleContent(reply, async () => {
    const body = request.body;
    const knowledgeBaseId = knowledge.index.config.knowledgeBaseId;
    if (body?.knowledgeBaseId !== knowledgeBaseId) throw new ContentRequestError(409, "知识库已切换，原文仍留在本机");
    if (await hasActiveKnowledgeBaseRun(knowledgeBaseId)) throw new ContentRequestError(409, "请等当前整理完成后再保存原文");
    if (typeof body?.text !== "string" || !body.text.trim() || body.text.length > 50_000) throw new ContentRequestError(400, "请先写下要保存的原文");
    if (typeof body.id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(body.id) || !Number.isInteger(body.revision) || Number(body.revision) < 1) throw new ContentRequestError(400, "请先暂存后再保存原文");
    const folder = captureFolder(body.folder);
    if (typeof body.diaryDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.diaryDate)) throw new ContentRequestError(400, "日期无效");
    const captureId = body.id;
    const revision = body.revision as number;
    const text = body.text;
    const diaryDate = body.diaryDate;
    const markdown = `# ${diaryDate} 原文\n\n${text.trim()}\n`;
    return captures.mutate(knowledgeBaseId, async state => {
      const entry = state.entries.find((item) => item.id === captureId);
      if (!entry || entry.revision !== revision || entry.text !== text || entry.folder !== folder || entry.diaryDate !== diaryDate) throw new ContentRequestError(409, "草稿已经变化，请重新保存原文");
      if (entry.status === "saved") throw new ContentRequestError(409, "这份已经保存过。继续整理会更新原文件；只存原文不会覆盖它。");
      const title = `原文 ${diaryDate} ${captureId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`;
      const bound = bindContentWorkspace(knowledge);
      const page = await new PageWriter(bound).createSource(title, folder, markdown);
      if (!page) throw new ContentRequestError(500, "原文没有写入生活记录");
      await new ImportStore(bound).trackCreatedSource(page);
      const savedAt = new Date().toISOString();
      Object.assign(entry, {
        status: "saved",
        text,
        originalText: text,
        content: text.trim(),
        pageId: page.id,
        storedPath: page.relativePath,
        fileHash: createHash("sha256").update(markdown).digest("hex"),
        updatedAt: savedAt,
        revision: entry.revision + 1,
      });
      return page;
    });
  }, 201));
}
