import type { FastifyInstance } from "fastify";
import type { KnowledgeRuntime } from "../runtime/knowledge-runtime.js";
import { listBuildSkills } from "../modules/skills/skill-catalog.js";
import { listReasoningLenses } from "../modules/skills/lens-catalog.js";
import { readSkillFile, readSkillTree, SkillFileRequestError } from "../modules/skills/skill-files.js";

export function registerSkillRoutes(app: FastifyInstance, knowledge: KnowledgeRuntime): void {
  app.get("/api/build/skills", async () => listBuildSkills(knowledge.vaultRoot, knowledge.index));
  app.get("/api/build/skill-tree", async () => readSkillTree(knowledge.vaultRoot, knowledge.index));
  app.get<{ Querystring: { path?: string } }>("/api/build/skill-file", async (request, reply) => {
    try {
      return await readSkillFile(knowledge.vaultRoot, knowledge.index, request.query.path || "");
    } catch (error) {
      if (error instanceof SkillFileRequestError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
  app.get("/api/lenses", async () => listReasoningLenses(knowledge.vaultRoot, knowledge.index));
}
