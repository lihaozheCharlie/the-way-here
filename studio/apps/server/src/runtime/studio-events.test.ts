import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
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
