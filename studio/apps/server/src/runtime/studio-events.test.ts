import { EventEmitter } from "node:events";
import type { FastifyReply, FastifyRequest } from "fastify";
import { afterEach, expect, it, vi } from "vitest";
import { StudioEvents } from "./studio-events.js";

afterEach(() => vi.useRealTimers());

it("keeps delivering run completion after the request ends, until the response disconnects", () => {
  vi.useFakeTimers();
  const request = new EventEmitter();
  const response = Object.assign(new EventEmitter(), { writeHead: vi.fn(), write: vi.fn() });
  const events = new StudioEvents();
  events.connect({ raw: request } as FastifyRequest, { raw: response, hijack: vi.fn() } as unknown as FastifyReply);
  request.emit("close");
  events.broadcast("run", { id: "demo-run", status: "completed" });
  expect(response.write).toHaveBeenLastCalledWith('event: run\ndata: {"id":"demo-run","status":"completed"}\n\n');
  vi.advanceTimersByTime(20_000);
  expect(response.write).toHaveBeenLastCalledWith(": keep-alive\n\n");
  response.emit("close");
  response.write.mockClear();
  events.broadcast("run", { id: "another-run" });
  vi.advanceTimersByTime(40_000);
  expect(response.write).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
