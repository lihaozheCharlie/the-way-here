import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { MobileFiles } from "./files.js";

export interface SpaceEvent {
  version: 1; id: string; knowledgeBaseId: string; requestId: string;
  action: "request" | "cancel" | "delete" | "restore" | "purge";
  at: string; name: string; expiresAt?: string;
}
export interface SpaceState {
  status: "active" | "requested" | "deleted" | "purged";
  requestId?: string; requestedAt?: string; deletedAt?: string; expiresAt?: string; name?: string;
}
const priority = { request: 0, delete: 1, cancel: 2, restore: 2, purge: 3 };
export function reduceSpaceEvents(events: SpaceEvent[], knowledgeBaseId: string): SpaceState {
  let state: SpaceState = { status: "active" };
  for (const event of events.filter(e => e && e.version === 1 && e.knowledgeBaseId === knowledgeBaseId && /^[a-zA-Z0-9_-]{1,100}$/.test(e.id) && /^[a-zA-Z0-9_-]{1,100}$/.test(e.requestId) && Object.hasOwn(priority, e.action) && Number.isFinite(Date.parse(e.at))).sort((a,b) => Date.parse(a.at)-Date.parse(b.at) || priority[a.action]-priority[b.action] || a.id.localeCompare(b.id))) {
    if (event.action === "request" && state.status === "active") state = { status:"requested", requestId:event.requestId, requestedAt:event.at, name:event.name };
    else if (event.requestId === state.requestId) {
      if (event.action === "cancel" && state.status === "requested") state = {status:"active"};
      if (event.action === "delete" && state.status === "requested" && event.expiresAt && Date.parse(event.expiresAt) > Date.parse(event.at)) state = {...state,status:"deleted",deletedAt:event.at,expiresAt:event.expiresAt};
      if (event.action === "restore" && state.status === "deleted" && state.expiresAt && Date.parse(event.at) < Date.parse(state.expiresAt)) state = {status:"active"};
      if (event.action === "purge" && state.status === "deleted" && state.expiresAt && Date.parse(event.at) >= Date.parse(state.expiresAt)) state = {...state,status:"purged"};
    }
  }
  return state;
}
export class MobileSpaceLifecycle {
  constructor(private files: MobileFiles) {}
  async state(): Promise<SpaceState> {
    const manifest = await this.files.manifest(); if (!manifest) return {status:"active"};
    const events = await Promise.all((await this.files.names(".mobile/space-events")).map(name => this.files.json(`.mobile/space-events/${name}`) as Promise<SpaceEvent>));
    return reduceSpaceEvents(events, manifest.knowledgeBaseId);
  }
  async apply(action: "delete" | "restore" | "cancel", requestId: string, name: string, now = new Date()): Promise<SpaceState> {
    const manifest = await this.files.manifest(), state = await this.state();
    if (!manifest || manifest.readOnly || name !== manifest.name || state.requestId !== requestId) throw new Error("空间或删除申请已变化，请重新核对。" );
    if (action === "delete" && state.status !== "requested" || action === "cancel" && state.status !== "requested" || action === "restore" && (state.status !== "deleted" || Date.parse(state.expiresAt || "") <= +now)) throw new Error("此空间目前不能执行这项操作。" );
    const causalNow = new Date(Math.max(+now, Date.parse(state.deletedAt || state.requestedAt || "") + 1 || 0));
    const id = randomUUID();
    const event: SpaceEvent = {version:1,id,knowledgeBaseId:manifest.knowledgeBaseId,requestId,action,at:causalNow.toISOString(),name,...(action === "delete" ? {expiresAt:new Date(+causalNow + 30*86400000).toISOString()} : {})};
    await this.files.write(`.mobile/space-events/${id}.json`, event, true);
    return this.state();
  }
  async purgeExpired(now = new Date()): Promise<void> {
    const manifest = await this.files.manifest(), state = await this.state();
    if (!manifest || manifest.readOnly || (state.status !== "deleted" && state.status !== "purged") || !state.expiresAt || Date.parse(state.expiresAt) > +now) return;
    const id = randomUUID();
    if (state.status !== "purged") await this.files.write(`.mobile/space-events/${id}.json`, {version:1,id,knowledgeBaseId:manifest.knowledgeBaseId,requestId:state.requestId,action:"purge",at:now.toISOString(),name:manifest.name}, true);
    // Keep the manifest and append-only deletion evidence, not recoverable content.
    const sidecars = (await readdir(await this.files.resolve(".mobile"))).filter(name => !["space-events","coordination.lock","executor.json"].includes(name)).map(name => `.mobile/${name}`);
    const prediction = `${manifest.wikiPath.split("/").slice(0,-1).join("/")}/predictions/state.json`.replace(/^\//, "");
    const stateFile = await this.files.json(prediction) as {knowledgeBaseId?:string} | undefined;
    if (stateFile?.knowledgeBaseId === manifest.knowledgeBaseId) await rm(await this.files.resolve(prediction),{force:true});
    for (const relative of [manifest.sourcesPath,manifest.wikiPath,...sidecars]) await rm(await this.files.resolve(relative), {recursive:true,force:true});
  }
}
