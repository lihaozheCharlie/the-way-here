import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { WikiRun } from "@the-way-here/shared";
import { AgentComposerSettings, type AgentSettingsController } from "./AgentSettings";
import { ContextualRunPanel } from "./Collaboration";

const mocks = vi.hoisted(() => ({ useApi: vi.fn() }));
vi.mock("../../shared/use-api", () => ({ useApi: mocks.useApi }));
const agent = {
  draft: { runtimeId: "codex", codex: { model: "demo-model", effort: "high" } },
  codexModels: [{ id: "demo-model", displayName: "Demo model" }],
  codexEfforts: ["low", "high"], codexRuntime: { available: true },
  configuredApiKey: false, loading: false, saving: false, dirty: false,
} as unknown as AgentSettingsController;

function fixture(status: WikiRun["status"], outputTarget?: WikiRun["outputTarget"]): WikiRun {
  return { id: "demo-run", knowledgeBaseId: "demo", mode: "auto", runtimeId: "codex", status,
    title: "匿名对话", prompt: "接着聊", createdAt: "2026-09-21T00:00:00Z", events: [], approvals: [], changes: [], outputTarget,
  } as unknown as WikiRun;
}

describe("shared conversation model settings", () => {
  it.each(["completed", "running", "failed", "interrupted", "validating"] as const)("keeps model settings in the reply composer when %s", (status) => {
    mocks.useApi.mockReturnValue({ data: fixture(status), loading: false });
    const html = renderToStaticMarkup(<MemoryRouter><ContextualRunPanel agent={agent} runId="demo-run" revision={0} runList={[]} onRunId={() => {}} onNew={() => {}} onClose={() => {}} /></MemoryRouter>);
    expect(html).toContain('aria-label="AI 设置"');
    expect(html).toContain('context-reply-ai-demo-run-codex-model');
    expect(html).toContain('context-reply-ai-demo-run-codex-effort');
    expect(html).toContain("调整从下一轮生效");
  });
  it("also exposes settings during source dialogue", () => {
    mocks.useApi.mockReturnValue({ data: fixture("completed", { kind: "journey-report", importId: "demo", storedPath: "demo/report.md", label: "匿名旅程" }), loading: false });
    const html = renderToStaticMarkup(<MemoryRouter><ContextualRunPanel agent={agent} runId="demo-run" revision={0} runList={[]} onRunId={() => {}} onNew={() => {}} onClose={() => {}} /></MemoryRouter>);
    expect(html).toContain('aria-label="AI 设置"');
  });
  it("uses the same settings control for new chats without a runtime restriction", () => {
    const html = renderToStaticMarkup(<AgentComposerSettings id="new-chat" agent={agent} />);
    expect(html).toContain('aria-label="AI 设置"');
    expect(html).toContain('new-chat-codex-model');
    expect(html).not.toContain('role="radio" disabled');
  });
});
