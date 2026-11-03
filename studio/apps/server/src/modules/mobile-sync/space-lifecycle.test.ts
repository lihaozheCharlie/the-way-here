import { mkdtemp, mkdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MobileFiles } from "./files.js";
import { MobileSpaceLifecycle, reduceSpaceEvents, type SpaceEvent } from "./space-lifecycle.js";

describe("anonymous mobile space lifecycle", () => {
  const event = (action: SpaceEvent["action"], at: string): SpaceEvent => ({version:1,id:action,knowledgeBaseId:"anonymous",requestId:"request",action,at,name:"Anonymous"});
  it("ignores another space, invalid actions and out-of-window restoration", () => {
    const request = event("request","2026-01-01T00:00:00Z");
    const deletion = {...event("delete","2026-01-02T00:00:00Z"),expiresAt:"2026-02-01T00:00:00Z"};
    expect(reduceSpaceEvents([request,{...deletion,knowledgeBaseId:"other"}],"anonymous").status).toBe("requested");
    expect(reduceSpaceEvents([request,deletion,event("restore","2026-02-02T00:00:00Z")],"anonymous").status).toBe("deleted");
    expect(reduceSpaceEvents([null as never,{...request,action:"constructor"} as never],"anonymous").status).toBe("active");
  });
  it("orders Mac confirmation after a phone request despite clock skew and purges every content sidecar", async () => {
    const root = await mkdtemp(path.join(tmpdir(),"twh-lifecycle-anonymous-"));
    try {
      const files = new MobileFiles(root), lifecycle = new MobileSpaceLifecycle(files);
      await files.write("mobile-space.json",{version:1,knowledgeBaseId:"anonymous",name:"Anonymous",sourcesPath:"vault/anonymous/sources",wikiPath:"vault/anonymous/wiki",createdAt:"2026-01-01T00:00:00Z",readOnly:false});
      await files.write(".mobile/space-events/request.json",event("request","2026-01-02T00:00:00Z"));
      const deleted = await lifecycle.apply("delete","request","Anonymous",new Date("2026-01-01T00:00:00Z"));
      expect(deleted.status).toBe("deleted"); expect(Date.parse(deleted.deletedAt!)).toBeGreaterThan(Date.parse(deleted.requestedAt!));
      await files.write(".mobile/understanding.json",{anonymous:true});
      await files.write("vault/anonymous/predictions/state.json",{knowledgeBaseId:"anonymous",anonymous:true});
      await mkdir(await files.resolve("vault/anonymous/sources"),{recursive:true});
      await lifecycle.purgeExpired(new Date("2026-03-01T00:00:00Z"));
      expect((await lifecycle.state()).status).toBe("purged");
      await expect(access(await files.resolve(".mobile/understanding.json"))).rejects.toThrow();
      await expect(access(await files.resolve("vault/anonymous/predictions/state.json"))).rejects.toThrow();
      await files.write(".mobile/stale-replica.json",{anonymous:true});
      await lifecycle.purgeExpired(new Date("2026-03-02T00:00:00Z"));
      await expect(access(await files.resolve(".mobile/stale-replica.json"))).rejects.toThrow();
      await expect(access(await files.resolve("mobile-space.json"))).resolves.toBeUndefined();
    } finally { await rm(root,{recursive:true,force:true}); }
  });
});
