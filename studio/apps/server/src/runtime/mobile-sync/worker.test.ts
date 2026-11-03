import { mkdtemp, mkdir, rm, writeFile, readdir, symlink, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import type { MobileTaskRequest, WikiRun } from "@the-way-here/shared";
import { parseMobileTask } from "@the-way-here/shared";
import { KnowledgeRuntime } from "../knowledge-runtime.js";
import type { RunCoordinator } from "../run-coordinator.js";
import type { PredictionService } from "../prediction-service.js";
import { MobileFiles } from "../../modules/mobile-sync/files.js";
import { MobileSyncWorker } from "./worker.js";
import { ImportStore } from "../../modules/imports/import-store.js";
import { prepareMobileWorkspace } from "../../modules/mobile-sync/prepare-workspace.js";
import { stateRootForVault } from "@the-way-here/run-manager";

// Index rebuilds are explicit in these protocol tests; OS event delivery is not under test.
// Avoid global fsevents limits during parallel simulator/backend verification.
vi.mock("chokidar", () => ({ default: { watch: () => { const watcher = { on: () => watcher, close: async () => undefined }; return watcher; } } }));

vi.mock("@the-way-here/run-manager", async importOriginal => {
  const original = await importOriginal<typeof import("@the-way-here/run-manager")>();
  const path = await import("node:path");
  return { ...original, stateRootForVault: (root: string) => path.join(root, ".runtime/mobile-test-state") };
});

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close(); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "twh-mobile-worker-")); cleanup.push(() => rm(root, { recursive: true, force: true }));
  cleanup.push(() => rm(stateRootForVault(root), { recursive: true, force: true }));
  await mkdir(path.join(root, "wiki")); await mkdir(path.join(root, "sources"));
  await writeFile(path.join(root, "wiki", "anonymous.md"), "# 匿名理解\n\n只用于手机协议测试。\n");
  const knowledge = await KnowledgeRuntime.create(root, undefined); cleanup.push(() => knowledge.close());
  const files = new MobileFiles(root);
  const jobs = new Map<string, WikiRun>();
  const start = vi.fn(async () => { const run = { id: "run-1", status: "running", knowledgeBaseId: "default" } as WikiRun; jobs.set(run.id, run); return run; });
  const interrupt = vi.fn(async () => {});
  const runs = { start, get: async (id: string) => jobs.get(id), interrupt, hasActiveKnowledgeBaseRun: async () => false } as unknown as RunCoordinator;
  const cancelPrediction = vi.fn(async () => {});
  const predictions = { hasActive: async () => false, view: async () => ({ status: "ready", understanding: { unlocked: true } }), request: vi.fn(), cancel: cancelPrediction } as unknown as PredictionService;
  const worker = new MobileSyncWorker(knowledge, runs, predictions, { error: vi.fn() } as unknown as FastifyBaseLogger, { deviceName: "Anonymous test Mac" }); cleanup.push(() => worker.close());
  return { root, knowledge, files, worker, start, jobs, interrupt, cancelPrediction, runs, predictions };
}
async function manifest(files: MobileFiles) { await files.write("mobile-space.json", { version: 1, knowledgeBaseId: "default", name: "匿名测试", sourcesPath: "sources", wikiPath: "wiki", readOnly: false, createdAt: new Date().toISOString() }); }
const task = (overrides: Partial<MobileTaskRequest> = {}): MobileTaskRequest => ({ version: 1, id: "fixture-1", knowledgeBaseId: "default", deviceId: "anonymous-device", kind: "chat", text: "匿名问题", sourcePaths: [], options: {}, createdAt: new Date().toISOString(), ...overrides });

describe("mobile file protocol", () => {
  it("rejects traversal, executable kinds, malformed options and empty tasks", () => {
    for (const value of [task({ sourcePaths: ["../outside"] }), task({ sourcePaths: ["sources/link/../other"] }), { ...task(), kind: "shell" }, { ...task(), options: { apiKey: {} } }, task({ text: "" })]) expect(() => parseMobileTask(value)).toThrow();
    expect(parseMobileTask(task()).kind).toBe("chat");
  });
  it("leaves ordinary desktop workspaces untouched and requires explicit pairing", async () => {
    const f = await fixture(); await f.worker.start(); expect(await f.files.json(".mobile/snapshot.json")).toBeUndefined();
    await manifest(f.files); await f.worker.start(); expect(await f.files.json(".mobile/snapshot.json")).toBeUndefined();
  });
  it("submits once, records completion, and reuses existing Wiki classification", async () => {
    const f = await fixture(); await manifest(f.files); await f.files.write(".mobile/queue/fixture-1.json", task()); await f.worker.enable();
    await f.worker.tick(); expect(f.start).toHaveBeenCalledTimes(1);
    f.jobs.get("run-1")!.status = "completed"; f.jobs.get("run-1")!.result = { finalAnswer: "匿名回答" };
    await f.worker.tick(); const receipt = await f.files.receipt("fixture-1"); expect(receipt?.status).toBe("completed"); expect(receipt?.result).toBe("匿名回答");
    const snapshot = await f.files.json(".mobile/snapshot.json") as { pages: unknown[]; deviceName: string }; expect(snapshot.pages).toHaveLength(1);
    expect(snapshot.deviceName).toBe("Anonymous test Mac");
    expect(await f.files.json(".mobile/heartbeat.json")).toMatchObject({ deviceName: "Anonymous test Mac" });
    await f.worker.tick(); expect(f.start).toHaveBeenCalledTimes(1);
  });
  it("does not replay a task after an uncertain crash during start", async () => {
    const f = await fixture(); await manifest(f.files); await f.files.write(".mobile/queue/fixture-1.json", task()); await f.files.write(".mobile/receipts/fixture-1.json", { version: 1, id: "fixture-1", knowledgeBaseId: "default", status: "processing", updatedAt: new Date().toISOString() });
    await f.worker.enable(); expect(f.start).not.toHaveBeenCalled(); expect((await f.files.receipt("fixture-1"))?.status).toBe("interrupted");
  });
  it("keeps another library's requests queued and cancels only the requested run", async () => {
    const f = await fixture(); await manifest(f.files); await f.files.write(".mobile/queue/other.json", task({ id: "other", knowledgeBaseId: "other" })); await f.files.write(".mobile/queue/fixture-1.json", task()); await f.worker.enable();
    expect(f.start).toHaveBeenCalledTimes(1); expect(await f.files.receipt("other")).toBeUndefined();
    await f.files.write(".mobile/cancel/fixture-1.json", { id: "fixture-1", knowledgeBaseId: "default" }); await f.worker.tick(); expect(f.interrupt).toHaveBeenCalledWith("run-1"); expect((await f.files.receipt("fixture-1"))?.status).toBe("cancelled");
  });
  it("cancels an already dispatched prediction before reporting cancellation", async () => {
    const f = await fixture(); await manifest(f.files);
    await f.files.write(".mobile/queue/fixture-1.json", task({ kind: "prediction" }));
    await f.files.write(".mobile/receipts/fixture-1.json", { version: 1, id: "fixture-1", knowledgeBaseId: "default", status: "waiting-approval", updatedAt: new Date().toISOString() });
    await f.files.write(".mobile/cancel/fixture-1.json", { id: "fixture-1", knowledgeBaseId: "default" });
    await f.worker.enable(); expect(f.cancelPrediction).toHaveBeenCalledWith("default"); expect((await f.files.receipt("fixture-1"))?.status).toBe("cancelled");
  });
  it("isolates malformed queue files without blocking valid requests", async () => {
    const f = await fixture(); await manifest(f.files);
    await f.files.write(".mobile/queue/broken.json", { arbitrary: "not a request" });
    await f.files.write(".mobile/queue/fixture-1.json", task());
    await f.worker.enable(); expect(f.start).toHaveBeenCalledTimes(1); expect(await f.files.json(".mobile/rejections/broken.json")).toMatchObject({ id: "broken" });
  });
  it("claims a request once when two Mac hosts poll concurrently", async () => {
    const f = await fixture(); await manifest(f.files); await f.files.write(".mobile/queue/fixture-1.json", task());
    const second = new MobileSyncWorker(f.knowledge, f.runs, f.predictions, { error: vi.fn() } as unknown as FastifyBaseLogger); cleanup.push(() => second.close());
    await Promise.all([f.worker.tick(), second.tick()]);
    expect(f.start).toHaveBeenCalledTimes(1);
    expect((await f.files.receipt("fixture-1"))?.status).toBe("processing");
  });
  it("reconciles renamed import paths only after the destination arrives", async () => {
    const f = await fixture(); await manifest(f.files);
    await f.files.write("sources/.imports/batch.json", { id: "batch", files: [{ storedPath: "sources/old.md" }] });
    await f.files.write(".mobile/relocations/rename-1.json", { version: 1, knowledgeBaseId: "default", previousPath: "sources/old.md", storedPath: "sources/new.md", hash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" });
    await f.worker.tick();
    expect(await f.files.json("sources/.imports/batch.json")).toMatchObject({ files: [{ storedPath: "sources/old.md" }] });
    await f.files.write(".mobile/relocations/rename-2.json", { version: 1, knowledgeBaseId: "default", previousPath: "sources/new.md", storedPath: "sources/final.md", hash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" });
    await writeFile(path.join(f.root, "sources/final.md"), "edited after two offline renames"); await f.worker.tick();
    expect(await f.files.json("sources/.imports/batch.json")).toMatchObject({ files: [{ storedPath: "sources/final.md" }] });
  });

  it("exports only the selected library and public engine, retaining originals and excluding runtime secrets", async () => {
    const f = await fixture();
    const destination = await mkdtemp(path.join(os.tmpdir(), "twh-mobile-export-")); cleanup.push(() => rm(destination, {recursive:true,force:true}));
    const config = f.knowledge.index.config;
    for (const folder of [config.paths.skills, config.paths.tools, "sources/.runtime", "other/wiki"]) await mkdir(path.join(f.root, folder), {recursive:true});
    await writeFile(path.join(f.root, config.paths.agentInstructions), "Public protocol");
    await writeFile(path.join(f.root, "sources/sample.md"), "anonymous source");
    await writeFile(path.join(f.root, "sources/.runtime/key"), "not exported");
    await writeFile(path.join(f.root, "other/wiki/secret.md"), "other library excluded");
    await writeFile(path.join(f.root, "the-way-here.config.yaml"), JSON.stringify({knowledgeBases:{default:{name:"selected"},other:{name:"excluded"}},agents:{privateToken:"never exported"}}));
    const exported = await prepareMobileWorkspace(f.root, config, destination);
    const files = new MobileFiles(exported);
    expect(await readFile(path.join(exported, "sources/sample.md"), "utf8")).toBe("anonymous source");
    expect(await files.json("sources/.runtime/key")).toBeUndefined();
    expect(await files.json("other/wiki/secret.md")).toBeUndefined();
    const exportedConfig = await readFile(path.join(exported, "the-way-here.config.yaml"), "utf8");
    expect(exportedConfig).not.toContain("privateToken"); expect(exportedConfig).not.toContain("excluded");
    expect(await readFile(path.join(f.root, "sources/sample.md"), "utf8")).toBe("anonymous source");
    await symlink(path.join(f.root, "other"), path.join(f.root, "sources/escape"));
    await expect(prepareMobileWorkspace(f.root, config, destination)).rejects.toThrow("符号链接");
    expect(await readdir(destination)).toHaveLength(1); // failed export removes only its incomplete destination
  });

});


describe("mobile import reliability and projections", () => {
  it("keeps successful files when another file is invalid or still downloading", async () => {
    const f = await fixture(); await manifest(f.files);
    await writeFile(path.join(f.root,"sources/good.md"),"# 匿名原话\n\n这是可保存的资料。");
    await writeFile(path.join(f.root,"sources/bad.pdf"),"not a supported text import");
    await f.files.write(".mobile/queue/partial.json",task({id:"partial",kind:"import",sourcePaths:["sources/good.md","sources/bad.pdf","sources/missing.txt"],options:{folder:"导入结果"}}));
    await f.worker.tick();
    const receipt = await f.files.receipt("partial"), result=JSON.parse(receipt!.result!);
    expect(receipt?.status).toBe("completed"); expect(result.imported).toBe(1); expect(result.failed).toHaveLength(2); expect(result.failed.map((item:any)=>item.path)).toEqual(["sources/bad.pdf","sources/missing.txt"]); expect(result.paths).toHaveLength(1);
    expect(await readFile(path.join(f.root,result.paths[0]),"utf8")).toContain("这是可保存的资料");
    expect(JSON.stringify(result.failed)).not.toContain(f.root);
  });
  it("deduplicates content and options across different task ids, including retries",async()=>{
    const f=await fixture();await manifest(f.files);await writeFile(path.join(f.root,"sources/a.md"),"# 匿名重复测试\n\n同一份内容");await writeFile(path.join(f.root,"sources/b.md"),"# 匿名重复测试\n\n同一份内容");
    const create=vi.spyOn(ImportStore.prototype,"create");
    await f.files.write(".mobile/queue/first.json",task({id:"first",kind:"import",sourcePaths:["sources/a.md"],options:{folder:"导入结果"}}));await f.worker.tick();
    const first=JSON.parse((await f.files.receipt("first"))!.result!);
    await f.files.write(".mobile/queue/retry.json",task({id:"retry",kind:"import",sourcePaths:["sources/b.md"],options:{folder:"导入结果"}}));await f.worker.tick();
    const retry=JSON.parse((await f.files.receipt("retry"))!.result!);expect(create).toHaveBeenCalledTimes(1);expect(retry).toMatchObject({imported:0,skipped:1,paths:first.paths});
  });
  it("imports only the previously missing file on retry after partial success",async()=>{
    const f=await fixture();await manifest(f.files);await writeFile(path.join(f.root,"sources/a.md"),"# 一份已到达的资料");
    const create=vi.spyOn(ImportStore.prototype,"create");const payload={kind:"import" as const,sourcePaths:["sources/a.md","sources/late.txt"],options:{folder:"导入结果"}};
    await f.files.write(".mobile/queue/first.json",task({id:"first",...payload}));await f.worker.tick();await writeFile(path.join(f.root,"sources/late.txt"),"这份资料稍后才到达");
    await f.files.write(".mobile/queue/retry.json",task({id:"retry",...payload}));await f.worker.tick();const result=JSON.parse((await f.files.receipt("retry"))!.result!);expect(result).toMatchObject({imported:1,skipped:1,failed:[]});expect(create).toHaveBeenCalledTimes(2);
  });
  it("does not replay an importer that failed after an uncertain side effect",async()=>{
    const f=await fixture();await manifest(f.files);await writeFile(path.join(f.root,"sources/input.md"),"# 模拟写入中断");
    const create=vi.spyOn(ImportStore.prototype,"create").mockImplementationOnce(async()=>{await writeFile(path.join(f.root,"sources/already-saved.md"),"已写入的片段必须保留");throw new Error("simulated failure after write");});
    const payload={kind:"import" as const,sourcePaths:["sources/input.md"],options:{folder:"导入结果"}};
    await f.files.write(".mobile/queue/first.json",task({id:"first",...payload}));await f.worker.tick();await f.files.write(".mobile/queue/retry.json",task({id:"retry",...payload}));await f.worker.tick();
    expect(create).toHaveBeenCalledTimes(1);expect((await f.files.receipt("retry"))?.status).toBe("failed");expect(JSON.parse((await f.files.receipt("retry"))!.result!).failed[0].reason).toContain("避免重复");expect(await readFile(path.join(f.root,"sources/already-saved.md"),"utf8")).toContain("保留");
  });
  it("maps prediction evidence paths in the initial and active task branches",async()=>{
    const f=await fixture();await manifest(f.files);const page=f.knowledge.index.list()[0]!;
    const view={knowledgeBaseId:"default",status:"ready",understanding:{unlocked:true},report:{current:"匿名预测",evidence:[{id:"e1",pageId:page.id,quote:"匿名证据"}],scenarios:[]}};
    f.predictions.view=vi.fn(async()=>view) as any;
    await f.worker.tick();expect(await f.files.json(".mobile/prediction.json")).toMatchObject({report:{evidence:[{pageId:page.relativePath}]}});expect(view.report.evidence[0]!.pageId).toBe(page.id);
    await f.files.write(".mobile/queue/prediction.json",task({id:"prediction",kind:"prediction"}));await f.files.write(".mobile/receipts/prediction.json",{version:1,id:"prediction",knowledgeBaseId:"default",status:"processing",phase:"prediction",updatedAt:new Date().toISOString()});await f.worker.tick();
    expect(await f.files.json(".mobile/prediction.json")).toMatchObject({report:{evidence:[{pageId:page.relativePath}]}});expect((await f.files.receipt("prediction"))?.status).toBe("completed");
  });
  it("exposes managed diary output paths even when read-only generation has no changes",async()=>{
    const f=await fixture();await manifest(f.files);await f.files.write(".mobile/queue/diary.json",task({id:"diary",kind:"diary"}));await f.worker.tick();
    await writeFile(path.join(f.root,"sources/diary.md"),"# 匿名日记\n\n用户确认的原话");await f.knowledge.index.rebuild();const page=f.knowledge.index.list().find(p=>p.relativePath==="sources/diary.md")!;
    const run=f.jobs.get("run-1")!;run.status="completed";run.changes=[];run.result={outputPageId:page.id,outputSavedAt:new Date().toISOString(),finalAnswer:"匿名日记"};await f.worker.tick();
    expect((await f.files.receipt("diary"))?.resultPaths).toEqual(["sources/diary.md"]);
    expect((await f.files.json(".mobile/snapshot.json") as any).capabilities).toEqual(expect.arrayContaining(["diary","topics"]));
  });
  it("cancels remaining imports without deleting a successful file",async()=>{
    const f=await fixture();await manifest(f.files);await writeFile(path.join(f.root,"sources/a.md"),"# 第一个资料");await writeFile(path.join(f.root,"sources/b.md"),"# 第二个资料");
    const original=ImportStore.prototype.create;const create=vi.spyOn(ImportStore.prototype,"create").mockImplementationOnce(async function(this:ImportStore,request){const batch=await original.call(this,request);await f.files.write(".mobile/cancel/import.json",{id:"import",knowledgeBaseId:"default"});return batch;});
    await f.files.write(".mobile/queue/import.json",task({id:"import",kind:"import",sourcePaths:["sources/a.md","sources/b.md"],options:{folder:"导入结果"}}));await f.worker.tick();
    const receipt=await f.files.receipt("import"),result=JSON.parse(receipt!.result!);expect(receipt?.status).toBe("cancelled");expect(result.imported).toBe(1);expect(create).toHaveBeenCalledTimes(1);expect(await readFile(path.join(f.root,result.paths[0]),"utf8")).toContain("第一个资料");
  });
});

it("rebuild-index uses the existing indexer without invoking any model",async()=>{const f=await fixture();await manifest(f.files);await f.files.write(".mobile/queue/index.json",task({id:"index",kind:"build",options:{action:"rebuild-index"}}));await f.worker.tick();expect(f.start).not.toHaveBeenCalled();expect((await f.files.receipt("index"))?.status).toBe("completed");});
it("preserves live letter paragraphs as explicitly incomplete task results",async()=>{const f=await fixture();await manifest(f.files);await f.files.write(".mobile/queue/chat.json",task({id:"chat"}));await f.worker.tick();const run=f.jobs.get("run-1")!;run.liveDraft={messageId:"anonymous-message",text:"尚未完成的匿名段落"};await f.worker.tick();expect(await f.files.receipt("chat")).toMatchObject({status:"processing",phase:"writing",result:"尚未完成的匿名段落"});});

it("exports a requested prediction range only for the matching completed thoughts",async()=>{
  const f=await fixture();await manifest(f.files);
  await f.files.write(".mobile/queue/prediction-scope.json",task({id:"prediction-scope",kind:"prediction",text:"匿名范围问题",options:{horizon:"半年"}}));await f.worker.tick();
  const thoughts=vi.mocked(f.predictions.request).mock.calls[0]![1];
  vi.spyOn(f.predictions,"view").mockResolvedValue({status:"ready",thoughts,understanding:{unlocked:true}} as any);
  await f.worker.tick();expect(await f.files.json(".mobile/prediction.json")).toMatchObject({question:"匿名范围问题",requestedTimeRange:"半年"});
  vi.mocked(f.predictions.view).mockResolvedValue({status:"ready",thoughts:"另一份Mac报告",understanding:{unlocked:true}} as any);
  await f.worker.tick();expect(await f.files.json(".mobile/prediction.json")).toMatchObject({question:"另一份Mac报告",requestedTimeRange:null});
});
it("honors an explicit isolated worker state root",async()=>{
  const f=await fixture();await manifest(f.files);const state=path.join(f.root,"isolated-state");
  const worker=new MobileSyncWorker(f.knowledge,f.runs,f.predictions,{error:vi.fn()} as unknown as FastifyBaseLogger,{stateRoot:state});cleanup.push(()=>worker.close());
  await f.files.write(".mobile/queue/state.json",task({id:"state"}));await worker.tick();
  expect(await readdir(state)).toContain("mobile-claims");
});

it("marks an unbound completed letter failed and retains its candidate without publishing",async()=>{
 const f=await fixture();await manifest(f.files);const request=task({id:"unbound-letter",kind:"letter"});
 await f.files.write(".mobile/queue/unbound-letter.json",request);
 f.jobs.set("unbound-run",{id:"unbound-run",knowledgeBaseId:"default",configSnapshot:f.knowledge.index.config,mode:"read",status:"completed",result:{finalAnswer:"匿名未验证回信"}} as WikiRun);
 await f.files.write(".mobile/receipts/unbound-letter.json",{version:1,id:request.id,knowledgeBaseId:"default",status:"processing",runId:"unbound-run",updatedAt:new Date().toISOString()});
 await f.worker.tick();expect(await f.files.receipt(request.id)).toMatchObject({status:"failed",resultPaths:[],result:"匿名未验证回信"});
 expect(await readdir(path.join(stateRootForVault(f.root),"mobile-letter-candidates",request.id))).toHaveLength(1);
 expect((await f.files.json(".mobile/snapshot.json") as any).pages).toHaveLength(1);
});
