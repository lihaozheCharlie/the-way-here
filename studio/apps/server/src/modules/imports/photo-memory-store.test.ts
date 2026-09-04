import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { WikiIndex } from "@the-way-here/wiki-core";
import { buildRelationships } from "@the-way-here/life-views";
import type { PhotoMemoryOutputTarget } from "@the-way-here/shared";
import { PhotoMemoryStore, validatePhotoPeople } from "./photo-memory-store.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "twh-photo-test-")));
  roots.push(root);
  const index = new WikiIndex(root);
  await index.rebuild();
  const store = new PhotoMemoryStore(root);
  const content = (await sharp({ create: { width: 80, height: 100, channels: 3, background: "#578a83" } }).png().toBuffer()).toString("base64");
  const file = { name: "anonymous.png", content, encoding: "base64" };
  const batch = await store.create(index.config, { title: "匿名测试记忆", files: [file] });
  await index.rebuild();
  const target: PhotoMemoryOutputTarget = { kind: "photo-memory", importId: batch.id, storedPath: batch.files[0]!.storedPath, label: "测试", phase: "analyze" };
  return { root, index, store, file, batch, target, config: index.config };
}
const person = { id: "person-1", name: "测试人物", box: { x: 0.2, y: 0.1, width: 0.5, height: 0.6 }, useAsAvatar: true };
const bindingsOutput = (people: unknown[]) => `<photo-people>${JSON.stringify({ people })}</photo-people>`;
async function addPerson(root: string, index: WikiIndex, name: string) {
  const relativePath = `wiki/07 实体/人物/${name}.md`;
  await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await writeFile(path.join(root, relativePath), `---\ntype: entity\naliases: [匿名别名]\n---\n# ${name}\n\n匿名测试人物。\n`);
  await index.rebuild();
  return index.list().find((page) => page.relativePath === relativePath)!;
}

describe("photo memories", () => {
  it("preserves selected page IDs through saving, conversation context and build context", async () => {
    const { root, store, config, target, batch, index } = await fixture();
    const page = await addPerson(root, index, "测试人物");
    await store.update(config, batch.id, { revision: 1, photoId: "photo-1", people: [{ ...person, name: "匿名别名", pageId: page.id }], story: "已确认的回忆" }, index);
    expect((await store.read(config, batch.id)).photos[0]!.people[0]).toMatchObject({ pageId: page.id, name: page.title });
    expect(await store.context(config, batch.id)).toContain(`"pageId":"${page.id}"`);
    const context = await store.buildContext(config, batch.id, index);
    expect(context).toContain(`"pageId":"${page.id}"`);
    expect(context).toContain('"aliases":["匿名别名"]');
    expect(context).toContain("无需为人物合并二次询问");
    const report = await readFile(path.join(root, target.storedPath), "utf8");
    expect(report).toContain(`人物页面 ID：${page.id}`);
    expect(report).not.toContain("新人物");
  });

  it("accepts model-resolved aliases and first-person references to existing pages", async () => {
    const { root, store, config, batch, index } = await fixture();
    const page = await addPerson(root, index, "自己");
    const people = ["匿名别名", "我", "自己"].map((name, i) => ({ ...person, id: `person-${i}`, name }));
    await store.update(config, batch.id, { revision: 1, photoId: "photo-1", people, story: "这是我的照片" }, index);
    await store.publish(config, batch.id, index, [], bindingsOutput(people.map((p, i) => ({ photoId: "photo-1", personId: p.id, ...(i === 0 ? { pagePath: page.relativePath } : { pageId: page.id }) }))));
    const memory = await store.read(config, batch.id);
    expect(memory.builtPeople).toHaveLength(3);
    expect(memory.photos[0]!.people.every((p) => p.pageId === page.id)).toBe(true);
    expect((await store.decorate(config, buildRelationships(index), index)).groups.flatMap((g) => g.people).find((p) => p.id === page.id)?.photos).toHaveLength(1);
  });

  it("rejects model overrides and out-of-scope references before publishing any association", async () => {
    const { root, store, config, batch, index } = await fixture();
    const chosen = await addPerson(root, index, "已选人物");
    const other = await addPerson(root, index, "另一个人物");
    await store.update(config, batch.id, { revision: 1, photoId: "photo-1", people: [{ ...person, pageId: chosen.id }], story: "确认回忆" }, index);
    const ref = { photoId: "photo-1", personId: person.id, pageId: chosen.id };
    await expect(store.publish(config, batch.id, index, [], bindingsOutput([{ ...ref, pageId: other.id }]))).rejects.toThrow("不一致");
    for (const invalid of [{ ...ref, photoId: "missing-photo" }, { ...ref, personId: "missing-person" }, { ...ref, pageId: "other-library-person" }, { photoId: ref.photoId, personId: ref.personId, pagePath: "../other/wiki/自己.md" }]) {
      await expect(store.publish(config, batch.id, index, [], bindingsOutput([invalid]))).rejects.toThrow("之外");
    }
    const memory = await store.read(config, batch.id);
    expect(memory.revision).toBe(2);
    expect(memory.builtPeople).toBeUndefined();
    expect(memory.photos[0]!.people[0]!.pageId).toBe(chosen.id);
  });

  it("keeps unresolved model results unbound even when a same-name page was created", async () => {
    const { root, store, config, batch, index } = await fixture();
    const page = await addPerson(root, index, person.name);
    await store.update(config, batch.id, { revision: 1, photoId: "photo-1", people: [person], story: "确认回忆" }, index);
    await store.publish(config, batch.id, index, [page.relativePath], bindingsOutput([]));
    expect((await store.read(config, batch.id)).builtPeople).toEqual([]);
  });

  it("accepts unchanged reports from the old template but still detects external edits", async () => {
    const { root, store, config, target, batch, index } = await fixture();
    await store.update(config, batch.id, { revision: 1, photoId: "photo-1", people: [person], story: "已确认的旧回忆" }, index);
    const reportPath = path.join(root, target.storedPath);
    const oldReport = (await readFile(reportPath, "utf8")).replace("用户提供的称呼，待结合姓名、别名与讲述匹配已有档案", "新人物，勿与同名者自动合并");
    await writeFile(reportPath, oldReport);
    const metadataPath = path.join(root, config.paths.sources, ".photo-memories", batch.id, "memory.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    await writeFile(metadataPath, JSON.stringify({ ...metadata, reportHash: createHash("sha256").update(oldReport).digest("hex") }));
    await expect(store.assertBuild(config, batch.id, target.storedPath)).resolves.toBeUndefined();
    expect(await store.buildContext(config, batch.id, index)).toContain("本次授权取代该限制");
    await writeFile(reportPath, oldReport + "\n外部改动");
    await expect(store.assertBuild(config, batch.id, target.storedPath)).rejects.toThrow("修改");
  });
  it("keeps originals local and analysis candidates out of the source report", async () => {
    const { root, store, config, target, batch } = await fixture();
    const prepared = await store.prepare(config, target);
    const input = await store.analysisInput(config, batch.id);
    expect(input.images).toHaveLength(1);
    expect(input.prompt).toContain("这张照片给你留下了什么记忆？");
    expect(input.images[0]!.path).toMatch(/photo-1.jpg$/);
    expect(await sharp(input.images[0]!.path).metadata()).toMatchObject({ format: "jpeg", width: 80, height: 100 });
    await store.materialize(config, prepared, '可以聊聊这张照片。<photo-memory>{"photos":[{"id":"photo-1","observation":"画面有一张桌子","question":"这是什么时候拍的？"}]}</photo-memory>');
    expect((await store.read(config, batch.id)).photos[0]?.observation).toContain("桌子");
    expect((await store.read(config, batch.id)).photos[0]?.question).toBe("这张照片给你留下了什么记忆？");
    expect(await readFile(path.join(root, target.storedPath), "utf8")).not.toContain("桌子");
    await expect(store.assertBuild(config, batch.id, target.storedPath)).rejects.toThrow("确认");
  });

  it("requires explicit story confirmation and rejects stale AI or concurrent writes", async () => {
    const { store, config, target, batch, index } = await fixture();
    const prepared = await store.prepare(config, { ...target, phase: "enrich" });
    const outcomes = await Promise.allSettled([store.update(config, batch.id, { revision: 1, story: "这是我确认的故事。" }, index), store.update(config, batch.id, { revision: 1, story: "另一个窗口的旧稿" }, index)]);
    expect(outcomes.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    await expect(store.materialize(config, prepared, "<photo-memory>过时的 AI 草稿</photo-memory>")).rejects.toThrow("已更新");
    await expect(store.assertBuild(config, batch.id, target.storedPath)).resolves.toBeUndefined();
    expect((await store.read(config, batch.id)).confirmedStory).toBe("这是我确认的故事。");
    const fresh = await store.prepare(config, { ...target, phase: "enrich" });
    await store.materialize(config, fresh, "<photo-memory>新的待确认草稿</photo-memory>");
    await expect(store.assertBuild(config, batch.id, target.storedPath)).rejects.toThrow("确认");
  });

  it("preserves an externally edited source report instead of overwriting it", async () => {
    const { root, store, config, target, batch, index } = await fixture();
    await writeFile(path.join(root, target.storedPath), "外部修改，需要保留");
    await expect(store.update(config, batch.id, { revision: 1, story: "新故事" }, index)).rejects.toThrow("外部");
    expect(await readFile(path.join(root, target.storedPath), "utf8")).toBe("外部修改，需要保留");
    expect((await store.read(config, batch.id)).revision).toBe(1);
  });

  it("validates photos, crop boxes, IDs, batches, and knowledge-base ownership", async () => {
    const { store, config, file, batch, target } = await fixture();
    await expect(store.create(config, { files: Array(11).fill(file) })).rejects.toThrow("1–10");
    await expect(store.create(config, { files: [{ ...file, name: "bad.heic" }] })).rejects.toThrow("HEIC");
    await expect(store.create(config, { files: [{ ...file, content: Buffer.from("not an image").toString("base64") }] })).rejects.toThrow("解码");
    await expect(store.create(config, { files: [file], targetFolder: "../escape" })).rejects.toThrow();
    await expect(store.read({ ...config, knowledgeBaseId: "another" }, batch.id)).rejects.toThrow("不属于");
    await expect(store.read(config, "../../outside")).rejects.toThrow("编号");
    await expect(store.assetPath(config, batch.id, "photo-1", "person-1")).rejects.toThrow("不存在");
    await expect(store.prepare(config, { ...target, storedPath: "sources/other.md" })).rejects.toThrow("不一致");
    expect(() => validatePhotoPeople([{ ...person, box: { ...person.box, x: 1 } }])).toThrow("范围");
    expect(() => validatePhotoPeople([{ ...person, box: { ...person.box, width: NaN } }])).toThrow("范围");
    expect(() => validatePhotoPeople([person, person])).toThrow("重复");
    expect(() => validatePhotoPeople([{ ...person, name: "" }])).toThrow("名称");
  });

  it("rejects source folders that traverse symlinks", async () => {
    const { root, store, config, file } = await fixture();
    await mkdir(path.join(root, "outside"));
    await symlink(path.join(root, "outside"), path.join(root, "sources", "linked"));
    await expect(store.create(config, { files: [file], targetFolder: "linked" })).rejects.toThrow("符号链接");
  });

  it("publishes cropped avatars only for user-bound people after a successful build, and supports revocation", async () => {
    const { root, store, config, batch, index } = await fixture();
    const relativePath = "wiki/07 实体/人物/测试人物.md";
    await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
    await writeFile(path.join(root, relativePath), "---\ntype: entity\n---\n# 测试人物\n\n匿名演示人物。\n");
    await index.rebuild();
    const page = index.list().find((p) => p.relativePath === relativePath)!;
    expect(page).toBeDefined();
    await store.update(config, batch.id, { revision: 1, photoId: "photo-1", people: [person], story: "一次聚餐的回忆" }, index);
    // Name alone must not silently match an existing person.
    await store.publish(config, batch.id, index);
    expect((await store.read(config, batch.id)).builtPeople).toEqual([]);
    await store.update(config, batch.id, { revision: 3, photoId: "photo-1", people: [{ ...person, pageId: page.id }], story: "一次聚餐的回忆" }, index);
    await store.publish(config, batch.id, index);
    const avatarPath = await store.assetPath(config, batch.id, "photo-1", person.id);
    expect(await sharp(avatarPath).metadata()).toMatchObject({ width: 256, height: 256, format: "jpeg" });
    const view = await store.decorate(config, buildRelationships(index), index);
    const decorated = view.groups.flatMap((g) => g.people).find((p) => p.id === page.id)!;
    expect(decorated.avatarUrl).toContain(person.id);
    expect(decorated.photos).toHaveLength(1);
    await store.update(config, batch.id, { revision: 5, photoId: "photo-1", people: [{ ...person, pageId: page.id, useAsAvatar: false }] }, index);
    await expect(store.assetPath(config, batch.id, "photo-1", person.id)).rejects.toThrow("不存在");
    expect((await store.decorate(config, buildRelationships(index), index)).groups.flatMap((g) => g.people).find((p) => p.id === page.id)?.avatarUrl).toBeUndefined();
  });
});

describe("grouped photo-person confirmation", () => {
  it("commits an entire group in one revision and rejects invalid members atomically", async () => {
    const { root, index, store, config, file } = await fixture();
    const batch = await store.create(config, { title: "匿名旅程", files: [file, { ...file, name: "second.png" }] });
    const page = await addPerson(root, index, "同一个人物");
    const updates = ["photo-1", "photo-2"].map((photoId, i) => ({ photoId, people: [{ ...person, id: `person-${i}`, pageId: page.id }] }));
    await expect(store.update(config, batch.id, { revision: 1, photos: [updates[0], { ...updates[1], photoId: "missing" }] }, index)).rejects.toThrow("不存在");
    expect((await store.read(config, batch.id)).revision).toBe(1);
    expect((await store.read(config, batch.id)).photos.every((photo) => photo.people.length === 0)).toBe(true);
    await expect(store.update(config, batch.id, { revision: 1, photos: [updates[0], updates[0]] }, index)).rejects.toThrow("列表");
    await expect(store.update(config, batch.id, { revision: 1, photos: updates, photoId: "photo-1" }, index)).rejects.toThrow("同时");
    await expect(store.update(config, batch.id, { revision: 1, photos: null }, index)).rejects.toThrow("列表");
    const saved = await store.update(config, batch.id, { revision: 1, photos: updates }, index);
    expect(saved.revision).toBe(2);
    expect(saved.photos.map((photo) => photo.people[0]?.pageId)).toEqual([page.id, page.id]);
    expect(saved.photos.map((photo) => photo.people[0]?.name)).toEqual([page.title, page.title]);
    await expect(store.update(config, batch.id, { revision: 1, photos: updates }, index)).rejects.toThrow("已更新");
  });
});
