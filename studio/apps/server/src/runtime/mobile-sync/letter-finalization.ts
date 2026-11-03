import { createHash, randomUUID } from "node:crypto";
import { cp, link, lstat, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMobileRelativePath, type MobileTaskRequest, type VaultConfig, type WikiRun } from "@the-way-here/shared";
import { validateFrozenSourceReferences, type FrozenSourceReference } from "@the-way-here/wiki-core";
import { MobileFiles } from "../../modules/mobile-sync/files.js";
import { runValidationCommands } from "../../services/validation-runner.js";

type QualityCheck = (input: { root: string; config: VaultConfig; candidatePath: string }) => Promise<void>;
interface Input { files: MobileFiles; local: MobileFiles; config: VaultConfig; task: MobileTaskRequest; run: WikiRun; perspectiveName: string; qualityCheck?: QualityCheck }
/** Final publication is host-owned, bound to the run's frozen corpus and guarded before any Wiki write. */
export async function finalizeMobileLetter(input: Input): Promise<string> {
  const { files, local, config, task, run } = input;
  const answer = run.result?.finalAnswer?.trim() || "";
  const answerHash = createHash("sha256").update(answer).digest("hex");
  const candidatePath = `mobile-letter-candidates/${task.id}/${answerHash}.json`;
  // Keep the original candidate before doing anything that could fail; never put it in the synced space.
  const candidate = { version: 1, taskId: task.id, runId: run.id, knowledgeBaseId: task.knowledgeBaseId, frozenEvidence: run.frozenEvidence, answer, status: "pending", updatedAt: new Date().toISOString() };
  await local.write(candidatePath, candidate);
  try {
    if (!answer || answer.length > 100_000) throw new Error("回信正文为空或超过安全长度");
    if (run.status !== "completed" || run.mode !== "read" || run.knowledgeBaseId !== task.knowledgeBaseId || run.configSnapshot?.knowledgeBaseId !== task.knowledgeBaseId || config.knowledgeBaseId !== task.knowledgeBaseId || run.configSnapshot.paths.sources !== config.paths.sources || run.configSnapshot.paths.wiki !== config.paths.wiki) throw new Error("回信任务与当前空间或原始配置不一致");
    const reference = run.frozenEvidence;
    if (!reference || reference.id !== task.id || !/^[a-f0-9]{64}$/.test(reference.hash)) throw new Error("回信缺少本轮绑定的冻结来源版本");
    const raw = await local.json(`mobile-scopes/${task.id}/evidence.json`, 32 * 1024 * 1024) as any;
    if (raw?.knowledgeBaseId !== task.knowledgeBaseId || raw.inputHash !== reference.hash || typeof raw.frozenAt !== "string" || !Number.isFinite(Date.parse(raw.frozenAt)) || !Array.isArray(raw.catalogue) || !Array.isArray(raw.pages) || raw.catalogue.length < 1 || raw.catalogue.length > 100 || raw.pages.length !== raw.catalogue.length) throw new Error("冻结来源的空间、版本或结构不一致");
    const ids = new Set<string>();
    const pages: FrozenSourceReference[] = raw.catalogue.map((entry: any) => {
      if (typeof entry.pageId !== "string" || !isMobileRelativePath(entry.pageId) || !entry.pageId.startsWith(config.paths.sources + "/") || !entry.pageId.endsWith(".md") || entry.category !== "sources" || entry.isSource !== true || typeof entry.title !== "string" || ids.has(entry.pageId)) throw new Error("冻结来源不是当前空间唯一的原始记录");
      ids.add(entry.pageId);
      const bodies = raw.pages.filter((page: any) => page?.pageId === entry.pageId);
      if (bodies.length !== 1 || bodies[0].category !== "sources" || typeof bodies[0].markdown !== "string") throw new Error("冻结来源正文缺失或重复");
      return { path: entry.pageId, title: entry.title, markdown: bodies[0].markdown };
    });
    if (createHash("sha256").update(JSON.stringify(pages)).digest("hex") !== reference.hash) throw new Error("冻结来源正文或目录已变化，回信未发布");
    const cited = validateFrozenSourceReferences(answer, pages);
    const assertCitedFiles = async () => {
      for (const page of cited) {
        try { if (!(await lstat(await files.resolve(page.path))).isFile()) throw new Error("not regular"); }
        catch { throw new Error("实际引用的所选来源已移动、删除或变为不安全路径，请重新选择范围；本地候选已保留"); }
      }
    };
    await assertCitedFiles();
    const saved = `${config.paths.wiki}/12 近况回信/${task.createdAt.slice(0,10)}-iPhone-${task.id}.md`;
    const body = `---\nmobile_task_id: ${task.id}\nreference_count: ${cited.length}\nevidence_frozen_at: ${JSON.stringify(raw.frozenAt)}\nevidence_hash: ${reference.hash}\nperspective: ${JSON.stringify(task.options.perspective || "auto")}\nperspective_name: ${JSON.stringify(input.perspectiveName)}\nvoice: ${JSON.stringify(task.options.voice || "老朋友")}\n---\n# ${task.createdAt.slice(0,10)} 近况回信\n\n${answer}\n\n## 参考来源\n${cited.map(page => `- [[${page.path.replace(/\.md$/i, "")}|${page.title}]]`).join("\n")}\n`;
    const reviewPath = `mobile-letter-review/${task.id}/${answerHash}`;
    await mkdir(await local.resolve(reviewPath), { recursive: true });
    const review = new MobileFiles(await local.resolve(reviewPath));
    for (const page of pages) {
      // The shared link gate needs link targets, not a second live-source retrieval.
      const destination = await review.resolve(page.path); await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, "# Frozen source target\n", { mode: 0o600 });
    }
    const staged = await review.resolve(saved); await mkdir(path.dirname(staged), { recursive: true }); await writeFile(staged, body, { mode: 0o600 });
    await (input.qualityCheck ?? (async ({ root, config }) => sharedLetterQuality(files, root, config)))({ root: review.root, config: run.configSnapshot, candidatePath: saved });
    const checked = await readFile(await review.resolve(saved), "utf8");
    if (checked !== body) throw new Error("质量检查改变了候选内容，需在 Mac 核对后发布");
    validateFrozenSourceReferences(checked.slice(checked.indexOf("\n# ")), pages);
    await assertCitedFiles();
    const destination = await files.resolve(saved); await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${saved}.${randomUUID()}.tmp`, temporaryURL = await files.resolve(temporary);
    try {
      await writeFile(temporaryURL, checked, { flag: "wx", mode: 0o600 });
      try { await link(temporaryURL, await files.resolve(saved)); }
      catch (error: any) { if (error.code !== "EEXIST") throw error; if (await readFile(await files.resolve(saved), "utf8") !== checked) throw new Error("同名回信已经变化，保留现有文件与本地候选，请在 Mac 核对"); }
    } finally { await unlink(temporaryURL).catch(() => undefined); }
    await local.write(candidatePath, { ...candidate, status: "published", savedPath: saved, citedPaths: cited.map(page => page.path) });
    return saved;
  } catch (error: any) {
    await local.write(candidatePath, { ...candidate, status: "failed", diagnostic: error instanceof Error ? error.message : "回信校验未通过" });
    throw error;
  }
}

/** Reuse the product's existing shared link gate against isolated targets and the candidate only. */
async function sharedLetterQuality(files: MobileFiles, stageRoot: string, config: VaultConfig): Promise<void> {
  const tools = process.env.TWH_BUNDLED_ENGINE ? path.join(process.env.TWH_BUNDLED_ENGINE, "tools") : await files.resolve(config.paths.tools);
  const stageTools = path.join(stageRoot, "knowledge-engine/tools");
  await rm(stageTools, { recursive: true, force: true });
  await cp(tools, stageTools, { recursive: true, filter: async source => !(await lstat(source)).isSymbolicLink() && !source.includes("__pycache__") && !source.endsWith(".pyc") });
  // JSON is valid YAML. No user config, connection paths, or secrets are copied.
  await writeFile(path.join(stageRoot, "the-way-here.config.yaml"), JSON.stringify({ version: 3, defaultKnowledgeBase: config.knowledgeBaseId, knowledgeBases: { [config.knowledgeBaseId]: { name: "Frozen letter quality candidate", paths: { wiki: config.paths.wiki, sources: config.paths.sources } } } }), { mode: 0o600 });
  const checked = await runValidationCommands({ vaultRoot: stageRoot, knowledgeBaseId: config.knowledgeBaseId, config: { ...config, validation: { commands: [["python3", "knowledge-engine/tools/validate_wiki_links.py"]] } } });
  if (!checked.valid || checked.results.length !== 1 || checked.results[0]?.exitCode !== 0) throw new Error("共享链接质量门未通过；本地候选已保留");
}
