import type { FastifyInstance } from "fastify";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import type { PageCategory } from "@the-way-here/shared";
import { ContentRequestError, PageWriter } from "../modules/content/page-writer.js";
import { bindContentWorkspace } from "../modules/content/content-workspace.js";
import { listSourceFolders, listSourceFolderChildren } from "../modules/content/source-folder-catalog.js";
import { ImportStore } from "../modules/imports/import-store.js";
import { handleContent } from "./content-errors.js";

export function registerPageRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, hasActiveKnowledgeBaseRun: (knowledgeBaseId: string) => Promise<boolean>): void {
  const contentWorkspace = () => bindContentWorkspace(knowledge);
  const writer = () => {
    const bound = contentWorkspace();
    return new PageWriter(bound, (previousPath, storedPath) => new ImportStore(bound).renameSource(previousPath, storedPath));
  };
  app.get<{ Querystring: { category?: PageCategory; sources?: string } }>("/api/pages", async (request) => {
    const sources = request.query.sources === undefined ? undefined : request.query.sources === "true";
    return knowledge.index.list({ category: request.query.category, sources });
  });
  app.get<{ Params: { "*": string } }>("/api/pages/*", async (request, reply) => {
    const page = knowledge.index.get(decodeURIComponent(request.params["*"]));
    return page || reply.code(404).send({ error: "页面不存在" });
  });
  app.get<{ Querystring: { q?: string; sources?: string } }>("/api/search", async (request) => request.query.sources === "true" ? knowledge.index.search(request.query.q || "", Number.MAX_SAFE_INTEGER).filter(page => page.isSource) : knowledge.index.search(request.query.q || ""));

  app.get<{ Querystring: { parent?: string } }>("/api/sources/folders", async (request, reply) => handleContent(reply, () => request.query.parent === undefined ? listSourceFolders(knowledge) : listSourceFolderChildren(contentWorkspace(), request.query.parent)));
  app.post<{ Body: { folder?: unknown; action?: unknown; name?: unknown; modifiedAt?: unknown; knowledgeBaseId?: unknown } }>("/api/sources/folder-action", async (request, reply) => {
    const bound = contentWorkspace();
    return handleContent(reply, () => knowledge.serializeMutation(async () => {
      if (request.body?.knowledgeBaseId !== bound.index.config.knowledgeBaseId) throw new ContentRequestError(409, "知识库已切换，请刷新后重试");
      return new PageWriter(bound, (before, after) => new ImportStore(bound).renameSource(before, after)).folderAction(request.body);
    }));
  });
  app.post<{ Body: { folder?: unknown; knowledgeBaseId?: unknown } }>("/api/sources/folders", async (request, reply) => {
    const bound = contentWorkspace();
    return handleContent(reply, () => knowledge.serializeMutation(async () => {
      if (request.body?.knowledgeBaseId !== undefined && request.body.knowledgeBaseId !== bound.index.config.knowledgeBaseId) throw new ContentRequestError(409, "知识库已切换，请刷新后重试");
      return new PageWriter(bound).createSourceFolder(request.body?.folder);
    }), 201);
  });
  app.post<{ Body: { title?: string; folder?: string } }>("/api/sources", async (request, reply) => handleContent(reply, async () => {
    const bound = contentWorkspace();
    const page = await new PageWriter(bound).createSource(request.body?.title, request.body?.folder);
    if (page && !page.externalSource) await new ImportStore(bound).trackCreatedSource(page);
    return page;
  }, 201));
  app.delete<{ Body: { pageId?: string; expectedModifiedAt?: string } }>("/api/sources/file", async (request, reply) => handleContent(reply, () => writer().deleteSource(request.body?.pageId, request.body?.expectedModifiedAt)));
  app.delete<{ Body: { pageId?: unknown; expectedModifiedAt?: unknown } }>("/api/pages/file", async (request, reply) => handleContent(reply, () => writer().deleteWikiPage(request.body?.pageId, request.body?.expectedModifiedAt)));
  app.delete<{ Body: { folder?: string; expectedFileCount?: number } }>("/api/sources/folder", async (request, reply) => handleContent(reply, () => writer().deleteSourceFolder(request.body?.folder, request.body?.expectedFileCount)));
  app.post<{ Body: { pageId?: string } }>("/api/files/reveal", async (request, reply) => handleContent(reply, () => writer().openInEditor(request.body?.pageId, true)));
  app.post<{ Body: { pageId?: string } }>("/api/files/open-in-editor", async (request, reply) => handleContent(reply, () => writer().openInEditor(request.body?.pageId)));
  app.post<{ Body: { pageId?: unknown; folder?: unknown; expectedModifiedAt?: unknown; knowledgeBaseId?: unknown } }>("/api/sources/move", async (request, reply) => {
    const bound = contentWorkspace();
    return handleContent(reply, () => knowledge.serializeMutation(async () => {
      if (!request.body || request.body.knowledgeBaseId !== bound.index.config.knowledgeBaseId) throw new ContentRequestError(409, "知识库已切换，请刷新后重试");
      if (await hasActiveKnowledgeBaseRun(bound.index.config.knowledgeBaseId)) throw new ContentRequestError(409, "请等当前 AI 任务结束后再移动文件");
      return new PageWriter(bound, (before, after) => new ImportStore(bound).renameSource(before, after)).move(request.body);
    }));
  });
  app.post<{ Body: { pageId?: string; fileName?: string; expectedModifiedAt?: string } }>("/api/pages/rename", async (request, reply) => handleContent(reply, () => writer().rename(request.body?.pageId, request.body?.fileName, request.body?.expectedModifiedAt)));
  app.put<{ Params: { "*": string }; Body: { markdown?: string; expectedModifiedAt?: string } }>("/api/pages/*", async (request, reply) => handleContent(reply, () => writer().save(decodeURIComponent(request.params["*"]), request.body?.markdown, request.body?.expectedModifiedAt)));
}
