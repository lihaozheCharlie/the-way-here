import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { StudioApplication, type StudioApplicationOptions } from "./studio-application.js";

export type StudioServerOptions = StudioApplicationOptions & { development?: boolean };

/** Web host only. The desktop entry never imports this network/static adapter. */
export class StudioServer {
  private constructor(private readonly application: StudioApplication) {}
  get app() { return this.application.app; }

  static async create(options: StudioServerOptions): Promise<StudioServer> {
    const application = await StudioApplication.create(options);
    const app = application.app;
    app.get("/api/events", async (request, reply) => application.connectEvents(request, reply));
    if (process.env.THE_WAY_HERE_DESKTOP_TOKEN) {
      const token = process.env.THE_WAY_HERE_DESKTOP_TOKEN;
      app.addHook("onRequest", async (request, reply) => {
        if (request.headers["x-twh-desktop"] !== token) return reply.code(403).send({ error: "需要本机桌面会话" });
      });
    }
    if (!options.development) {
      const serverDir = path.dirname(fileURLToPath(import.meta.url));
      await app.register(fastifyStatic, { root: process.env.THE_WAY_HERE_WEB_ROOT || path.resolve(serverDir, "../../web/dist"), prefix: "/" });
      app.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "接口不存在" });
        return reply.sendFile("index.html");
      });
    }
    return new StudioServer(application);
  }

  async listen(host: string, port: number): Promise<void> {
    await this.app.listen({ host, port });
    this.app.log.info(`The Way Here: http://${host}:${port}`);
  }

  async close(): Promise<void> { await this.application.close(); }
}
