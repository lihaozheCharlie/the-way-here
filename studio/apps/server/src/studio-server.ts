import { SourceConnections } from "./runtime/source-connections.js";
import { registerSourceConnectionRoutes } from "./routes/source-connection-routes.js";
import path from "node:path";
import { registerAgentSettingsRoutes } from "./routes/agent-settings-routes.js";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { registerContentRoutes } from "./routes/content-routes.js";
import { registerImportRoutes } from "./routes/import-routes.js";
import { registerRunRoutes } from "./routes/run-routes.js";
import { registerPhotoMemoryRoutes } from "./routes/photo-memory-routes.js";
import { ImportStore } from "./modules/imports/import-store.js";
import { AgentRuntimeRegistry } from "./runtime/agent-runtime/registry.js";
import { KnowledgeRuntime } from "./runtime/knowledge-runtime.js";
import { RunCoordinator } from "./runtime/run-coordinator.js";

export type StudioServerOptions = {
  vaultRoot: string;
  knowledgeBaseId?: string;
  development?: boolean;
};

export class StudioServer {
  private constructor(
    readonly app: FastifyInstance,
    private readonly knowledge: KnowledgeRuntime,
    private readonly runs: RunCoordinator,
    private readonly sourceConnections: SourceConnections,
  ) {}

  static async create(options: StudioServerOptions): Promise<StudioServer> {
    const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024 });
    if (process.env.THE_WAY_HERE_DESKTOP_TOKEN) {
      const token = process.env.THE_WAY_HERE_DESKTOP_TOKEN;
      app.addHook("onRequest", async (request, reply) => {
        if (request.headers["x-twh-desktop"] !== token) return reply.code(403).send({ error: "需要本机桌面会话" });
      });
    }
    const knowledge = await KnowledgeRuntime.create(options.vaultRoot, options.knowledgeBaseId);
    app.addHook("onRequest", async (request, reply) => {
      const expected = request.headers["x-twh-knowledge-base"];
      const contentWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method) && !/^\/api\/(?:vault|runs|agent-)/.test(request.url);
      if (contentWrite && expected && expected !== knowledge.index.config.knowledgeBaseId) return reply.code(409).send({ error: "知识库已切换，请重新打开页面后再修改；原草稿尚未写入其他知识库。" });
    });
    const runtimes = await AgentRuntimeRegistry.create(knowledge.index.config.agents, knowledge.vaultRoot);
    const runs = new RunCoordinator(knowledge, runtimes, app.log);
    const imports = new ImportStore(knowledge);
    registerContentRoutes(app, knowledge, imports, () => runtimes.catalog(), (knowledgeBaseId) => runs.hasActiveKnowledgeBaseRun(knowledgeBaseId));
    registerImportRoutes(app, imports, runs);
    registerRunRoutes(app, runs);
    const sourceConnections = new SourceConnections(knowledge, runs);
    registerSourceConnectionRoutes(app, knowledge, sourceConnections);
    registerAgentSettingsRoutes(app, runtimes, knowledge.events);
    registerPhotoMemoryRoutes(app, knowledge, runs);
    app.get("/api/events", async (request, reply) => knowledge.events.connect(request, reply));

    if (!options.development) {
      const serverDir = path.dirname(fileURLToPath(import.meta.url));
      await app.register(fastifyStatic, { root: process.env.THE_WAY_HERE_WEB_ROOT || path.resolve(serverDir, "../../web/dist"), prefix: "/" });
      app.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "接口不存在" });
        return reply.sendFile("index.html");
      });
    }
    await runs.reconcile();
    await sourceConnections.start();
    return new StudioServer(app, knowledge, runs, sourceConnections);
  }

  async listen(host: string, port: number): Promise<void> {
    await this.app.listen({ host, port });
    this.app.log.info(`The Way Here: http://${host}:${port}`);
    this.app.log.info(`Vault: ${this.knowledge.vaultRoot}`);
  }

  async close(): Promise<void> {
    await this.sourceConnections.close();
    this.runs.close();
    await this.knowledge.close();
    await this.app.close();
  }
}
