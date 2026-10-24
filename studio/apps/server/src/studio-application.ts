import { SourceConnections } from "./runtime/source-connections.js";
import { registerSourceConnectionRoutes } from "./routes/source-connection-routes.js";
import { PredictionService } from "./runtime/prediction-service.js";
import { registerPredictionRoutes } from "./routes/prediction-routes.js";
import { registerAgentSettingsRoutes } from "./routes/agent-settings-routes.js";
import Fastify, { type FastifyInstance } from "fastify";
import { registerContentRoutes } from "./routes/content-routes.js";
import { registerImportRoutes } from "./routes/import-routes.js";
import { registerRunRoutes } from "./routes/run-routes.js";
import { registerPhotoMemoryRoutes } from "./routes/photo-memory-routes.js";
import { ImportStore } from "./modules/imports/import-store.js";
import { AgentRuntimeRegistry } from "./runtime/agent-runtime/registry.js";
import { KnowledgeRuntime } from "./runtime/knowledge-runtime.js";
import { RunCoordinator } from "./runtime/run-coordinator.js";

export type StudioApplicationOptions = {
  vaultRoot: string;
  knowledgeBaseId?: string;
};

export class StudioApplication {
  private constructor(
    readonly app: FastifyInstance,
    private readonly knowledge: KnowledgeRuntime,
    private readonly runs: RunCoordinator,
    private readonly sourceConnections: SourceConnections,
    private readonly predictions: PredictionService,
  ) {}

  static async create(options: StudioApplicationOptions): Promise<StudioApplication> {
    const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
    const knowledge = await KnowledgeRuntime.create(options.vaultRoot, options.knowledgeBaseId);
    app.addHook("onRequest", async (request, reply) => {
      const expected = request.headers["x-twh-knowledge-base"];
      const contentWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method) && !/^\/api\/(?:vault|agent-)/.test(request.url);
      if (contentWrite && expected && expected !== knowledge.index.config.knowledgeBaseId) return reply.code(409).send({ error: "知识库已切换，请重新打开页面后再修改；原草稿尚未写入其他知识库。" });
    });
    const runtimes = await AgentRuntimeRegistry.create(knowledge.index.config.agents, knowledge.vaultRoot);
    const runs = new RunCoordinator(knowledge, runtimes, app.log);
    const predictions = new PredictionService(knowledge, runtimes, app.log);
    registerPredictionRoutes(app, knowledge, predictions);
    const imports = new ImportStore(knowledge);
    registerContentRoutes(app, knowledge, {
      runtimeCatalog: () => runtimes.catalog(),
      hasActiveKnowledgeBaseRun: async (id) => await runs.hasActiveKnowledgeBaseRun(id) || await predictions.hasActive(id),
    });
    registerImportRoutes(app, imports, runs);
    registerRunRoutes(app, runs);
    const sourceConnections = new SourceConnections(knowledge, runs);
    registerSourceConnectionRoutes(app, knowledge, sourceConnections);
    registerAgentSettingsRoutes(app, runtimes, knowledge.events);
    registerPhotoMemoryRoutes(app, knowledge, runs);

    await predictions.reconcile();
    await runs.reconcile();
    await sourceConnections.start();
    return new StudioApplication(app, knowledge, runs, sourceConnections, predictions);
  }

  connectEvents(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply): void {
    this.knowledge.events.connect(request, reply);
  }

  subscribe(listener: (event: string, data: unknown) => void): () => void {
    return this.knowledge.events.subscribe(listener);
  }

  async close(): Promise<void> {
    await this.sourceConnections.close();
    this.predictions.close();
    this.runs.close();
    await this.knowledge.close();
    await this.app.close();
  }
}
