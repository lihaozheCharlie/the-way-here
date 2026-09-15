import type { FastifyInstance } from "fastify";
import type { PredictionService } from "../runtime/prediction-service.js";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";

export function registerPredictionRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime, predictions: PredictionService) {
  async function resolve(id: unknown) {
    if (typeof id !== "string" || !id.trim()) throw new Error("请指定知识库");
    return (await knowledge.resolve(id)).config.knowledgeBaseId;
  }
  app.get<{ Querystring: { knowledgeBaseId?: string } }>("/api/predictions", async (request, reply) => {
    let id: string;
    try { id = await resolve(request.query.knowledgeBaseId); } catch (error: any) { return reply.code(400).send({ error: error.message }); }
    return predictions.view(id);
  });
  app.post<{Body:{knowledgeBaseId?:string}}>("/api/predictions/scan", async (request, reply) => {
    let id: string;
    try { id = await resolve(request.body?.knowledgeBaseId); } catch (error: any) {return reply.code(400).send({error:error.message});}
    if (await predictions.hasActive(id)) return reply.code(409).send({error:"已有任务正在进行，请完成后再扫描"});
    void predictions.scan(id).catch(error=>app.log.error(error));
    return reply.code(202).send({accepted:true,knowledgeBaseId:id});
  });
  app.post<{ Body: { knowledgeBaseId?: string; thoughts?: string; thoughtKind?: "update" | "hypothesis" } }>("/api/predictions/refresh", async (request, reply) => {
    let id: string;
    try { id = await resolve(request.body?.knowledgeBaseId); } catch (error: any) { return reply.code(400).send({ error: error.message }); }
    let thoughts: string | undefined;
    let thoughtKind: "update" | "hypothesis" | undefined;
    try { thoughts = await predictions.validateThoughts(request.body?.thoughts); thoughtKind = predictions.validateThoughtKind(request.body?.thoughtKind); } catch (error: any) { return reply.code(400).send({error:error.message}); }
    if (await predictions.hasActive(id)) return reply.code(409).send({error:"已有预测正在进行，请完成后再提交想法"});
    const view = await predictions.view(id);
    if (!view.understanding.unlocked) return reply.code(409).send({ error: "请先扫描 Wiki 了解度，达到60分后再预测" });
    // Acknowledge without waiting for model startup or generation.
    void predictions.request(id, thoughts, thoughtKind).catch(error => app.log.error(error));
    return reply.code(202).send({ accepted: true, knowledgeBaseId: id });
  });
}
