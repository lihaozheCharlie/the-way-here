import type { AgentOutputTarget, AgentRunResult, RunFileChange, VaultConfig, WikiRun } from "@the-way-here/shared";
import type { WikiIndex } from "@the-way-here/wiki-core";
import { JourneyReportStore, JourneyReportTargetError } from "../modules/imports/journey-report-store.js";
import { PhotoMemoryStore, PhotoMemoryError } from "../modules/imports/photo-memory-store.js";
import { photoPeopleVisibleAnswer } from "../modules/imports/photo-person-bindings.js";
import { RunRequestError, type StartRunInput } from "./run-request.js";

/** Feature-specific preparation and persistence; never owns task state or runtime selection. */
export class RunOutputs {
  private readonly journeyReports: JourneyReportStore;
  private readonly photoMemories: PhotoMemoryStore;

  constructor(vaultRoot: string) {
    this.journeyReports = new JourneyReportStore(vaultRoot);
    this.photoMemories = new PhotoMemoryStore(vaultRoot);
  }

  async assertTarget(config: VaultConfig, index: WikiIndex, mode: WikiRun["mode"], outputTarget?: AgentOutputTarget): Promise<void> {
    if (outputTarget) {
      if (outputTarget.kind === "letter-version") {
        const targetPage = index.get(outputTarget.pageId);
        if (!targetPage || targetPage.category !== "letters") throw new RunRequestError(404, "要保存版本的回信不存在");
      } else if (outputTarget.kind === "journey-report") {
        if (mode !== "read") throw new RunRequestError(400, "消费旅程对话必须使用只读模式");
        try {
          await this.journeyReports.assertTarget(config, outputTarget);
        } catch (error) {
          if (error instanceof JourneyReportTargetError) throw new RunRequestError(404, error.message);
          throw error;
        }
      }
    }
  }

  async prepare(config: VaultConfig, index: WikiIndex, mode: WikiRun["mode"], request: StartRunInput, hasActiveRun: () => Promise<boolean>) {
    const input = { ...request };
    let photoInput: { images?: Array<{ path: string; mimeType: "image/jpeg" }>; prompt: string } | undefined;
    try {
      if (input.outputTarget?.kind === "photo-memory") {
        if (mode !== "read") throw new PhotoMemoryError(400, "照片对话只保存草稿，请另行构建");
        const target = input.outputTarget;
        input.outputTarget = await this.photoMemories.prepare(config, target);
        if (await hasActiveRun()) throw new PhotoMemoryError(409, "请等当前任务完成后，再继续照片记忆");
        input.sourceContext = target.phase === "enrich" ? { importId: target.importId, storedPath: target.storedPath, flow: "dialogue", operation: "enrich" } : undefined;
        photoInput = target.phase === "draft" ? await this.photoMemories.storyInput(config, target.importId, target.photoId!) : { prompt: await this.photoMemories.context(config, target.importId) };
      }
      if (input.sourceContext?.operation === "build") {
        const source = input.sourceContext;
        const page = index.list({ sources: true }).find((p) => p.relativePath === source.storedPath);
        if (page?.importChannel === "photos") {
          await this.photoMemories.assertBuild(config, source.importId, source.storedPath);
          photoInput = { prompt: await this.photoMemories.buildContext(config, source.importId, index) };
        }
        if (page?.importChannel === "alipay") await this.journeyReports.assertBuild(config, source.importId, source.storedPath);
      }
    } catch (error) {
      if (error instanceof PhotoMemoryError) throw new RunRequestError(error.statusCode, error.message);
      if (error instanceof JourneyReportTargetError) throw new RunRequestError(409, error.message);
      throw error;
    }
    if (input.outputTarget?.kind === "journey-report" && mode !== "read") {
      throw new RunRequestError(400, "消费旅程对话必须保持只读；请另行点击构建这份记录");
    }
    if (input.outputTarget?.kind === "journey-report") {
      const target = input.outputTarget;
      const context = input.sourceContext;
      if (context && (context.importId !== target.importId || context.storedPath !== target.storedPath || context.flow !== "dialogue" || context.operation && context.operation !== "enrich")) {
        throw new RunRequestError(400, "消费旅程报告与对话上下文不一致");
      }
      input.sourceContext = { importId: target.importId, storedPath: target.storedPath, flow: "dialogue", operation: "enrich" };
      try {
        input.outputTarget = await this.journeyReports.prepareTarget(config, target);
      } catch (error) {
        if (error instanceof JourneyReportTargetError) throw new RunRequestError(409, error.message);
        throw error;
      }
    }
    return { outputTarget: input.outputTarget, sourceContext: input.sourceContext, ...photoInput, strictReadOnly: input.outputTarget?.kind === "photo-memory" };
  }

  async materialize(run: WikiRun): Promise<{ result: AgentRunResult; rebuild: boolean }> {
    const target = run.outputTarget;
    const answer = run.result?.finalAnswer || "";
    const saved = target?.kind === "photo-memory"
      ? await this.photoMemories.materialize(run.configSnapshot, target, answer)
      : target?.kind === "journey-report"
        ? await this.journeyReports.materialize(run.configSnapshot, target, answer, run.id)
        : undefined;
    return {
      result: saved
        ? { ...run.result, finalAnswer: saved.visibleAnswer, outputSavedAt: saved.savedAt, completedAt: saved.savedAt }
        : { ...run.result, completedAt: new Date().toISOString() },
      rebuild: target?.kind === "journey-report",
    };
  }

  async publish(run: WikiRun, index: WikiIndex, changes: RunFileChange[]): Promise<{ finalAnswer?: string; diagnostic?: string }> {
    const source = run.sourceContext;
    if (source?.operation !== "build") return {};
    const page = index.list({ sources: true }).find((page) => page.relativePath === source.storedPath);
    if (page?.importChannel !== "photos") return {};
    try {
      await this.photoMemories.publish(run.configSnapshot, source.importId, index,
        changes.filter((change) => change.kind === "added").map((change) => change.path), run.result?.finalAnswer || "");
      return { finalAnswer: run.result?.finalAnswer ? photoPeopleVisibleAnswer(run.result.finalAnswer) : undefined };
    } catch (error: any) {
      return { diagnostic: `知识已构建，但人物影像未更新：${error.message}` };
    }
  }
}
