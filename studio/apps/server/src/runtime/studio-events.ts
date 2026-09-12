import type { FastifyReply, FastifyRequest } from "fastify";

/** One lifecycle for the stream, heartbeat and backpressure budget. */
export class StudioEvents {
  private readonly clients = new Map<FastifyReply, () => void>();

  private write(client: FastifyReply, frame: string): void {
    // Slow/offline readers must not cause unbounded server buffering.
    if (client.raw.destroyed || client.raw.writableEnded || client.raw.writableLength > 1_048_576) {
      this.clients.get(client)?.();
      client.raw.destroy();
      return;
    }
    client.raw.write(frame);
  }

  broadcast(event: string, data: unknown): void {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients.keys()) this.write(client, frame);
  }

  close(): void {
    for (const [client, cleanup] of this.clients) { cleanup(); client.raw.end(); }
  }

  connect(_request: FastifyRequest, reply: FastifyReply): void {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const cleanup = () => { clearInterval(keepAlive); this.clients.delete(reply); };
    const keepAlive = setInterval(() => this.write(reply, ": keep-alive\n\n"), 20_000);
    keepAlive.unref();
    this.clients.set(reply, cleanup);
    reply.raw.once("close", cleanup);
    reply.raw.once("error", cleanup);
    this.write(reply, "retry: 2000\n\n");
  }
}
