import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { StudioEvents } from "./studio-events.js";
function client() {
  const raw = Object.assign(new EventEmitter(), { destroyed:false, writableEnded:false, writableLength:0, writeHead:vi.fn(), write:vi.fn(), destroy:vi.fn(), end:vi.fn() });
  return {raw, reply:{raw,hijack:vi.fn()} as unknown as FastifyReply};
}
describe("event stream lifecycle",()=>{
  it("cleans up disconnected responses and stops broadcasting to them",()=>{
    const events=new StudioEvents(); const {raw,reply}=client();
    events.connect({} as FastifyRequest,reply); events.broadcast('index',{id:'demo'});
    expect(raw.write).toHaveBeenCalledTimes(2);
    raw.emit('close'); events.broadcast('index',{});
    expect(raw.write).toHaveBeenCalledTimes(2); events.close();
  });
  it("disconnects a stalled reader before buffering more updates",()=>{
    const events=new StudioEvents(); const {raw,reply}=client();
    events.connect({} as FastifyRequest,reply); raw.writableLength=1_048_577;
    events.broadcast('index',{}); expect(raw.destroy).toHaveBeenCalledOnce();
    expect(raw.write).toHaveBeenCalledTimes(1); events.close();
  });
  it("ends hijacked responses during server shutdown",()=>{
    const events=new StudioEvents(); const {raw,reply}=client();
    events.connect({} as FastifyRequest,reply); events.close(); events.close();
    expect(raw.end).toHaveBeenCalledOnce(); events.broadcast('index',{}); expect(raw.write).toHaveBeenCalledTimes(1);
  });
});

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
