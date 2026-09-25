import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { WikiRun } from "@the-way-here/shared";
import { AgentComposerSettings, AiConfiguration, type AgentSettingsController } from "./AgentSettings";
import { ContextualRunPanel } from "./Collaboration";
import { VoiceInputContext } from "../../shared/voice-input";

const mocks = vi.hoisted(() => ({ useApi: vi.fn() }));
vi.mock("../../shared/use-api", () => ({ useApi: mocks.useApi }));
const agent = {
  draft: { runtimeId: "codex", codex: { model: "demo-model", effort: "high" }, thirdParty: { providerId: "demo", model: "demo-model", effort: "high", apiKeyConfiguredProviders: [] } },
  runtimeId: "codex", model: "demo-model", effort: "high",
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
  it("shows a compact working state without task details", () => {
    mocks.useApi.mockReturnValue({ data: fixture("running"), loading: false });
    const html = renderToStaticMarkup(<MemoryRouter><ContextualRunPanel agent={agent} runId="demo-run" revision={0} runList={[]} onRunId={() => {}} onNew={() => {}} onClose={() => {}} /></MemoryRouter>);
    expect(html).toContain("正在准备");
    expect(html).not.toContain("你可以继续补充，我会接着处理。");
    expect(html).not.toContain("任务详情");
    expect(html).not.toContain("正在沿着你的来路慢慢梳理");
  });
  it("uses the same settings control for new chats without a runtime restriction", () => {
    const html = renderToStaticMarkup(<MemoryRouter><AgentComposerSettings id="new-chat" agent={agent} /></MemoryRouter>);
    expect(html).toContain('aria-label="AI 设置"');
    expect(html).toContain('new-chat-codex-model');
    expect(html).not.toContain('role="radio" disabled');
  });
  it("keeps model settings compact and hides the saved key editor until requested", () => {
    const thirdParty = {
      ...agent,
      draft: { runtimeId: "pi", codex: { model: "demo-model", effort: "high" }, thirdParty: { providerId: "demo", model: "demo-model", effort: "high", apiKeyConfiguredProviders: ["demo"] } },
      providers: [{ id: "demo", displayName: "Demo", description: "Demo API", models: [{ id: "demo-model", displayName: "Demo model", supportedReasoningEfforts: ["high"], defaultReasoningEffort: "high" }] }],
      selectedProvider: { id: "demo", displayName: "Demo", models: [{ id: "demo-model", displayName: "Demo model" }] },
      selectedThirdPartyModel: { id: "demo-model", displayName: "Demo model" },
      thirdPartyEfforts: ["high"], configuredApiKey: true, apiKey: "",
    } as unknown as AgentSettingsController;
    const html = renderToStaticMarkup(<AiConfiguration id="demo-settings" agent={thirdParty} />);
    expect(html).toContain("Demo API Key");
    expect(html).toContain("更换");
    expect(html).not.toContain("连接你的 AI 服务");
    expect(html).not.toContain("已安全保存，留空保持不变");
    expect(html).not.toContain('id="demo-settings-api-key"');
    expect(html).not.toContain("应用到所有入口");
  });
  it("keeps the build action available after a conversation starts and offers all four modes", () => {
    mocks.useApi.mockReturnValue({ data: fixture("completed"), loading: false });
    const html = renderToStaticMarkup(<MemoryRouter><ContextualRunPanel agent={agent} runId="demo-run" revision={0} runList={[]} onRunId={() => {}} onNew={() => {}} onClose={() => {}} /></MemoryRouter>);
    expect(html).toContain('aria-label="整理成日记并构建 Wiki"');
    expect(html).toContain('class="agent-wiki-build-button is-ready"');
    expect(html).toContain('class="agent-wiki-build-tooltip" role="tooltip">整理成日记并构建 Wiki</span>');
    expect(html).toContain("聊天模式");
    expect(html).toContain("Wiki 只读模式");
    expect(html).toContain("Wiki 写入模式");
    expect(html.slice(html.indexOf('class="agent-mode-picker"'), html.indexOf('class="agent-composer-toolbar-right"'))).not.toContain("<select");
    expect(html).toContain("开始后台构建");
  });
  it("places voice between model selection and send", () => {
    mocks.useApi.mockReturnValue({ data: fixture("completed"), loading: false });
    const html = renderToStaticMarkup(<MemoryRouter><VoiceInputContext.Provider value={() => <button className="voice-input-button" aria-label="语音说一段" />}><ContextualRunPanel agent={agent} runId="demo-run" revision={0} runList={[]} onRunId={() => {}} onNew={() => {}} onClose={() => {}} /></VoiceInputContext.Provider></MemoryRouter>);
    const toolbar = html.slice(html.indexOf('class="agent-composer-toolbar"'));
    expect(toolbar.indexOf('class="agent-settings-trigger is-model-chip"')).toBeLessThan(toolbar.indexOf('class="voice-input-button"'));
    expect(toolbar.indexOf('class="voice-input-button"')).toBeLessThan(toolbar.indexOf('class="context-agent-send"'));
  });
});
