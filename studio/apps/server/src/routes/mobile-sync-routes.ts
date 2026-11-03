import { MobileSpaceLifecycle } from "../modules/mobile-sync/space-lifecycle.js";
import type { FastifyInstance } from "fastify";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import type { PredictionService } from "../runtime/prediction-service.js";
import type { RunCoordinator } from "../runtime/run-coordinator.js";
import { MobileFiles } from "../modules/mobile-sync/files.js";
import { prepareMobileWorkspace } from "../modules/mobile-sync/prepare-workspace.js";
import { MobileSyncWorker } from "../runtime/mobile-sync/worker.js";
import { CompanionshipStore } from "../runtime/companionship-store.js";

export function registerMobileSyncRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, runs: RunCoordinator, worker: MobileSyncWorker, predictions?: PredictionService): void {
  app.get("/api/mobile-sync", async () => ({ manifest: await new MobileFiles(knowledge.vaultRoot).manifest(), lifecycle:await new MobileSpaceLifecycle(new MobileFiles(knowledge.vaultRoot)).state(), protocolVersion: 1 }));
  app.post<{Body:{action?:unknown;requestId?:unknown;confirmationName?:unknown;knowledgeBaseId?:unknown;confirmed?:unknown}}>("/api/mobile-sync/space",async (request,reply)=>{
    const manifest = await new MobileFiles(knowledge.vaultRoot).manifest(), body = request.body;
    if (!manifest || body?.knowledgeBaseId !== manifest.knowledgeBaseId || body.confirmed !== true || typeof body.requestId !== "string" || typeof body.confirmationName !== "string" || !["delete","restore","cancel"].includes(String(body.action))) return reply.code(400).send({error:"请核对空间名称并确认这项跨设备操作。"});
    if (await runs.hasAnyActiveRuns() || await predictions?.hasActive(manifest.knowledgeBaseId)) return reply.code(409).send({error:"空间仍有任务正在运行，请先完成或取消。"});
    try { return await new MobileSpaceLifecycle(new MobileFiles(knowledge.vaultRoot)).apply(body.action as "delete"|"restore"|"cancel",body.requestId,body.confirmationName); }
    catch(error:any) { return reply.code(409).send({error:error.message}); }
  });
  app.post<{Body:{knowledgeBaseId?:unknown;route?:unknown;path?:unknown}}>("/api/mobile-sync/handoff",async(request,reply)=>{
    const body=request.body,manifest=await new MobileFiles(knowledge.vaultRoot).manifest();
    if(!manifest || body?.knowledgeBaseId !== manifest.knowledgeBaseId || !["future","document"].includes(String(body.route)))return reply.code(409).send({error:"请先在Mac打开手机上的共享空间。"});
    if(["deleted","purged"].includes((await new MobileSpaceLifecycle(new MobileFiles(knowledge.vaultRoot)).state()).status))return reply.code(409).send({error:"空间已移到最近删除。"});
    const {index,config}=await knowledge.resolve(manifest.knowledgeBaseId);
    if(body.route === "future") {await knowledge.activate(config.knowledgeBaseId);return {route:"/predict-self"};}
    const page=index.list().find(p=>!p.externalSource && p.relativePath===body.path);
    if(!page)return reply.code(404).send({error:"文档尚未同步到这台Mac。"});
    await knowledge.activate(config.knowledgeBaseId);
    return {route:"/page/"+page.id.split("/").map(encodeURIComponent).join("/")};
  });
  app.post<{ Body: { knowledgeBaseId?: unknown; destination?: unknown; confirmed?: unknown } }>("/api/mobile-sync/prepare", async (request, reply) => {
    const selectedRoot = knowledge.vaultRoot, selectedConfig = structuredClone(knowledge.index.config), sourceKnowledgeBaseId = selectedConfig.knowledgeBaseId;
    const destination = request.body?.destination;
    if (request.body?.knowledgeBaseId !== sourceKnowledgeBaseId || request.body?.confirmed !== true || typeof destination !== "string") return reply.code(400).send({ error: "请通过原生目录选择器确认要连接的空间与位置。" });
    if (await runs.hasAnyActiveRuns()) return reply.code(409).send({ error: "请先完成正在进行的任务。" });
    try { const startedAt = await new CompanionshipStore(selectedRoot).startedAt(sourceKnowledgeBaseId); const root = await prepareMobileWorkspace(selectedRoot, selectedConfig, destination, startedAt); const manifest = await new MobileFiles(root).manifest(); if (!manifest) throw new Error("新空间身份无法读取，原空间保持不变。"); return { root, sourceKnowledgeBaseId, knowledgeBaseId: manifest.knowledgeBaseId }; }
    catch (error: any) { return reply.code(400).send({ error: error.message || "空间没有准备完成，原空间保持不变。" }); }
  });
  app.post<{ Body: { knowledgeBaseId?: unknown; confirmed?: unknown } }>("/api/mobile-sync/enable", async (request, reply) => {
    const manifest = await new MobileFiles(knowledge.vaultRoot).manifest();
    if (!manifest || request.body?.knowledgeBaseId !== manifest.knowledgeBaseId || request.body?.confirmed !== true) return reply.code(400).send({ error: "请先选择并确认手机共享空间。" });
    await worker.enable(); return { enabled: true };
  });
}
