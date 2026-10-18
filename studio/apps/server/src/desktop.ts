import path from "node:path";
import { StudioApplication } from "./studio-application.js";

type ParentPort = {
  on(event: "message", listener: (event: { data: any }) => void): void;
  postMessage(value: unknown): void;
};
const port = (process as typeof process & { parentPort?: ParentPort }).parentPort;
if (!port || !process.env.THE_WAY_HERE_VAULT) throw new Error("Desktop runtime requires a private parent port and explicit workspace");
const runtime = await StudioApplication.create({
  vaultRoot: path.resolve(process.env.THE_WAY_HERE_VAULT),
  knowledgeBaseId: process.env.THE_WAY_HERE_KNOWLEDGE_BASE,
});
await runtime.app.ready();
runtime.subscribe((event, data) => port.postMessage({ type: "runtime-event", event, data }));

port.on("message", ({ data: request }) => {
  if (request?.type !== "runtime-request") return;
  void (async () => {
    const { id, method, url, headers, body } = request;
    try {
      if (typeof id !== "string" || typeof url !== "string" || !url.startsWith("/api/") || url.startsWith("//") || /[\r\n\\]/.test(url)
        || !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(method)
        || (body && (!(body instanceof Uint8Array) || body.byteLength > 2 * 1024 * 1024))) throw new Error("Invalid desktop request");
      const result = await runtime.app.inject({ method, url, headers, payload: body ? Buffer.from(body) : undefined });
      if (result.rawPayload.byteLength > 64 * 1024 * 1024) throw new Error("Desktop response is too large");
      port.postMessage({ type: "runtime-response", id, status: result.statusCode, headers: result.headers, body: new Uint8Array(result.rawPayload) });
    } catch {
      port.postMessage({ type: "runtime-response", id: request.id, status: 500, headers: { "content-type": "application/json" }, body: new TextEncoder().encode(JSON.stringify({ error: "本机任务未能完成，请重试" })) });
    }
  })();
});
const shutdown = () => void runtime.close().finally(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
port.postMessage({ type: "runtime-ready", protocol: 1 });
