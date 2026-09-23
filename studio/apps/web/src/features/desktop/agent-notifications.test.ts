import { expect, it, vi } from "vitest";
import type { WikiRun } from "@the-way-here/shared";
import { AgentNotificationTracker } from "./agent-notifications";

function run(id: string, status: WikiRun["status"], overrides: Partial<WikiRun> = {}): WikiRun {
  return { id, knowledgeBaseId: "demo", title: "处理：一封回信", status, updatedAt: new Date().toISOString(), ...overrides } as WikiRun;
}

it("alerts once for a background Agent completion, identifies its originating module, and ignores history or interruption", () => {
  const notify = vi.fn();
  const tracker = new AgentNotificationTracker(notify);
  tracker.reconcileRuns([run("old", "completed", { updatedAt: "2020-01-01T00:00:00.000Z" }), run("letter", "running", { sourceModule: "近况回信 · 2026" })]);
  tracker.observeRun(run("letter", "completed", { sourceModule: "近况回信", outputTarget: { kind: "letter-version", pageId: "page", lensId: "a", lensName: "A", label: "回信" } }));
  tracker.observeRun(run("letter", "completed", { sourceModule: "近况回信" }));
  tracker.observeRun(run("stopped", "interrupted"));
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith({ title: "【近况回信】任务已完成", body: "处理：一封回信", route: "/conversation?detached=true&run=letter" });
});

it("reports failures and resolves their module from the task when older runs lack a source marker", () => {
  const notify = vi.fn();
  const tracker = new AgentNotificationTracker(notify);
  tracker.observeRun(run("photo", "running", { outputTarget: { kind: "photo-memory", importId: "import", storedPath: "photo", phase: "enrich", label: "相册" } }));
  tracker.observeRun(run("photo", "failed", { outputTarget: { kind: "photo-memory", importId: "import", storedPath: "photo", phase: "enrich", label: "相册" } }));
  expect(notify.mock.calls[0]?.[0]?.title).toBe("【照片记忆】任务未完成");
});

it("notifies for both prediction and initial understanding scan completion", () => {
  const notify = vi.fn();
  const tracker = new AgentNotificationTracker(notify);
  const startedAt = new Date().toISOString();
  tracker.observePrediction({ knowledgeBaseId: "demo", job: "scan", startedAt, status: "running" });
  tracker.observePrediction({ knowledgeBaseId: "demo", job: "scan", startedAt, status: "idle" });
  tracker.observePrediction({ knowledgeBaseId: "demo", job: "scan", startedAt, status: "idle" });
  tracker.observePrediction({ knowledgeBaseId: "demo", job: "prediction", startedAt, status: "running" });
  tracker.observePrediction({ knowledgeBaseId: "demo", job: "prediction", startedAt, status: "failed" });
  expect(notify.mock.calls.map(([message]) => message.title)).toEqual(["【看见未来】了解度扫描已完成", "【看见未来】预测未完成"]);
});
