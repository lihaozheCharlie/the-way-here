import type { AgentApprovalDecision, AgentModelOption, AgentRuntimeEvent } from "@the-way-here/shared";
import { CodexAppServer, type CodexServerRequest } from "@the-way-here/codex-bridge";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentExecutionRef, AgentRecoveryState, AgentRuntime, StartAgentExecution } from "./types.js";
import { RuntimeEventSource } from "./types.js";
import { MasCodexTools } from "./codex-mas-tools.js";

// A fixed bundled CLI and private CODEX_HOME keep user/plugin settings from
// enabling extra recipients or native commands in the store runtime.
const masDisabledFeatures = ["shell_tool", "unified_exec", "shell_snapshot", "multi_agent", "multi_agent_v2", "hooks", "apps", "plugins", "remote_plugin", "skill_search", "skill_mcp_dependency_install", "workspace_dependencies", "worktrees", "view_image", "computer_use", "browser_use", "browser_use_external", "browser_use_full_cdp_access", "in_app_browser", "in_app_local_automation", "in_app_voice", "in_app_dictation", "image_generation", "goals", "memories", "sleep_tool", "auth_elicitation", "daemon_auto_start"];
const masCodexConfigArgs = [
  ...masDisabledFeatures.flatMap(feature => ["-c", `features.${feature}=false`]),
  "-c", "features.skip_host_skill_discovery=true", "-c", 'web_search="disabled"', "-c", "mcp_servers={}",
];

const fallbackModel: AgentModelOption = {
  inputModalities: ["text", "image"],
  runtimeId: "codex",
  id: "gpt-5.6-sol",
  displayName: "GPT-5.6-Sol",
  supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
  defaultReasoningEffort: "high",
};

export class CodexRuntimeAdapter extends RuntimeEventSource implements AgentRuntime {
  readonly id = "codex" as const;
  private readonly codex: CodexAppServer;
  private readonly activeBySession = new Map<string, AgentExecutionRef>();

  private readonly masTools = new Map<string, MasCodexTools>();
  private readonly mas: boolean;

  constructor(private readonly command: string, private readonly options: { mas?: boolean; allowTools?: () => boolean; masCwd?: string } = {}) {
    super();
    this.mas = options.mas ?? process.env.TWH_MAS === "1";
    this.codex = new CodexAppServer(command, this.mas ? { experimentalApi: true, args: masCodexConfigArgs } : {});
    this.codex.on("notification", ({ method, params }) => this.onNotification(method, params));
    this.codex.on("request", (request: CodexServerRequest) => this.onRequest(request));
    this.codex.on("stderr", (message: string) => {
      for (const ref of this.activeBySession.values()) {
        this.emit({ ref, event: { type: "diagnostic", level: "warning", message } });
      }
    });
  }

  async inspect() {
    const availability = CodexAppServer.availability(this.command);
    if (!availability.available) {
      return { id: this.id, displayName: "Codex", available: false, reason: availability.reason, models: [] };
    }
    try {
      if (this.mas) {
        const login = await this.codex.request<{account?: {type?: string} | null}>("account/read", {refreshToken:false});
        if (login.account?.type !== "chatgpt") return { id: this.id, displayName: "Codex", available: false, reason: "请连接已通过 ChatGPT 登录的 Codex 配置目录", models: [] };
      }
      const models = await this.codex.listModels();
      return { id: this.id, displayName: "Codex", available: true, models: models.length ? models : [fallbackModel] };
    } catch (error: any) {
      return { id: this.id, displayName: "Codex", available: false, reason: error.message || "Codex 初始化失败", models: [] };
    }
  }

  async start(input: StartAgentExecution): Promise<AgentExecutionRef> {
    if (this.mas) return this.startMas(input);
    const sessionId = input.sessionId || await this.codex.startThread(input.cwd, input.model);
    const searchCommand = `ELECTRON_RUN_AS_NODE=1 ${shellQuote(process.execPath)} ${shellQuote(path.join(path.dirname(fileURLToPath(import.meta.url)), "search-wiki.js"))} --root ${shellQuote(input.cwd)} --knowledge-base ${shellQuote(input.config.knowledgeBaseId)} --query '检索短语'`;
    const directoryPermission = (input.config.sourceConnections || []).filter(item => item.aiWritable).map(item => item.path);
    const authorizedPrompt = directoryPermission.length ? `${input.prompt}\n\n用户已授权 AI 修改以下本地目录（含子目录），用户要求修改原文时可以直接操作真实文件；此授权仅在允许写入的任务中生效。来源引用文件为系统元数据，不能修改。目录：${JSON.stringify(directoryPermission)}` : input.prompt;
    const prompt = input.knowledgeEvidence ? input.prompt : `${authorizedPrompt}\n\n需要检索当前 Wiki 时，先自行把用户问题改写为 1–3 个具体实体、别名或短语，再运行本地检索命令：${searchCommand}。多个检索短语可重复 --query。不要直接用整句用户原话搜索；闲聊不运行检索。检索结果是候选片段，重要结论仍需回读对应页面或来源。`;
    let turnId: string;
    try {
      turnId = await this.codex.startTurn(sessionId, prompt, input.cwd, { model: input.model, effort: input.effort, imagePaths: input.images?.map((image) => image.path), readOnly: input.strictReadOnly || input.mode === "read", workspaceWrite: !input.strictReadOnly && input.mode !== "read" && Boolean(input.config.sourceConnections?.length), writableRoots: input.config.sourceConnections?.filter(item => item.aiWritable).map(item => item.path) });
    } catch (error) {
      if (!input.sessionId) throw error;
      await this.codex.resumeThread(sessionId, input.cwd);
      turnId = await this.codex.startTurn(sessionId, prompt, input.cwd, { model: input.model, effort: input.effort, imagePaths: input.images?.map((image) => image.path), readOnly: input.strictReadOnly || input.mode === "read", workspaceWrite: !input.strictReadOnly && input.mode !== "read" && Boolean(input.config.sourceConnections?.length), writableRoots: input.config.sourceConnections?.filter(item => item.aiWritable).map(item => item.path) });
    }
    const ref = { runtimeId: this.id, sessionId, turnId } satisfies AgentExecutionRef;
    this.activeBySession.set(sessionId, ref);
    return ref;
  }

  private async startMas(input: StartAgentExecution): Promise<AgentExecutionRef> {
    const cwd = this.options.masCwd || process.env.TWH_CODEX_WORKDIR;
    if (!cwd || !path.isAbsolute(cwd)) throw new Error("商店版 Codex 缺少独立工作目录");
    const settings = { sandbox: "read-only" as const, approvalPolicy: "never" as const };
    const sessionId = input.sessionId || await this.codex.startThread(cwd, input.model, {
      ...settings, dynamicTools: MasCodexTools.specifications(input),
    });
    if (this.activeBySession.has(sessionId)) throw new Error("此 Codex 会话仍有活动任务");
    if (input.sessionId) await this.codex.resumeThread(sessionId, cwd, settings);
    let tools: MasCodexTools;
    tools = new MasCodexTools(input, () => this.masTools.get(sessionId) === tools && Boolean(this.options.allowTools?.()));
    this.masTools.set(sessionId, tools);
    try {
      const turnId = await this.codex.startTurn(sessionId, `${input.prompt}\n\n使用应用提供的知识工具检索和修改资料。只读任务不允许写入；路径和写入权限由应用校验。无需运行 shell 或外部程序。`, cwd, {
        model: input.model, effort: input.effort, imagePaths: input.images?.map(image => image.path), readOnly: true,
      });
      const ref = { runtimeId: this.id, sessionId, turnId } satisfies AgentExecutionRef;
      this.activeBySession.set(sessionId, ref);
      return ref;
    } catch (error) { this.masTools.delete(sessionId); throw error; }
  }

  async steer(ref: AgentExecutionRef, prompt: string): Promise<void> {
    await this.codex.steer(ref.sessionId, ref.turnId, prompt);
  }

  async interrupt(ref: AgentExecutionRef): Promise<void> {
    this.masTools.delete(ref.sessionId);
    await this.codex.interrupt(ref.sessionId, ref.turnId);
  }

  async decide(_ref: AgentExecutionRef, approvalId: string | number, decision: AgentApprovalDecision): Promise<void> {
    const mapped = decision === "allow-once" ? "accept"
      : decision === "allow-for-session" ? "acceptForSession"
        : decision === "deny" ? "decline"
          : "cancel";
    this.codex.respondToServerRequest(approvalId, { decision: mapped });
  }

  async recover(ref: AgentExecutionRef): Promise<AgentRecoveryState> {
    try {
      const response = await this.codex.readThread(ref.sessionId);
      const thread = response?.thread || response;
      const turns: any[] = Array.isArray(thread?.turns) ? thread.turns : [];
      const turn = turns.find((entry) => entry.id === ref.turnId) || turns.at(-1);
      if (!turn) return { status: "missing" };
      if (turn.status === "completed") return { status: "completed", finalAnswer: finalAnswerOf(turn) };
      if (turn.status === "failed") return { status: "failed", error: turn.error?.message || turn.error };
      if (turn.status === "interrupted") return { status: "interrupted", error: turn.error?.message || turn.error };
      if (this.mas && !this.masTools.has(ref.sessionId)) {
        await this.codex.interrupt(ref.sessionId, ref.turnId);
        return { status: "interrupted", error: "应用重启后已停止未完成任务，请重新发起以确认本次权限" };
      }
      this.activeBySession.set(ref.sessionId, ref);
      return { status: "running" };
    } catch (error: any) {
      return { status: "missing", error: error.message };
    }
  }

  close(): void {
    this.masTools.clear();
    this.activeBySession.clear();
    this.codex.stop();
  }

  private onNotification(method: string, params: any): void {
    const sessionId = String(params?.threadId || params?.thread?.id || params?.turn?.threadId || "");
    const ref = this.activeBySession.get(sessionId);
    if (!ref || (params?.turnId && params.turnId !== ref.turnId)) return;
    if (method === "item/agentMessage/delta") {
      if (typeof params?.delta === "string" && params.delta) this.emit({ ref, event: { type: "assistant.delta", messageId: String(params.itemId), text: params.delta } });
      return;
    }
    if (method.endsWith("/delta")) return;
    for (const event of codexEvents(method, params)) this.emit({ ref, event });
    if (method === "turn/completed") { this.activeBySession.delete(sessionId); this.masTools.delete(sessionId); }
  }

  private onRequest(request: CodexServerRequest): void {
    const sessionId = String(request.params?.threadId || (request.params as any)?.thread?.id || (request.params as any)?.turn?.threadId || "");
    const ref = this.activeBySession.get(sessionId);
    if (this.mas && request.method === "item/tool/call") {
      const tools = this.masTools.get(sessionId);
      const params = request.params;
      const failed = (error: unknown) => ({ success: false, contentItems: [{ type: "inputText", text: error instanceof Error ? error.message : "工具执行失败" }] });
      if (!ref || !tools || params.turnId !== ref.turnId || typeof params.tool !== "string" || typeof params.callId !== "string" || params.namespace) {
        this.codex.respondToServerRequest(request.id, failed(new Error("工具调用不属于当前活动任务"))); return;
      }
      void tools.execute(params.tool, params.arguments, params.callId).then(
        result => this.codex.respondToServerRequest(request.id, result),
        error => this.codex.respondToServerRequest(request.id, failed(error)),
      );
      return;
    }
    if (!ref || this.mas) {
      this.codex.respondToServerRequest(request.id, { decision: "decline" });
      return;
    }
    const params = request.params || {};
    this.emit({
      ref,
      event: {
        type: "approval.requested",
        approval: {
          requestId: request.id,
          runtimeId: this.id,
          operation: String(request.method).includes("command") ? "command" : "tool",
          title: "Codex 请求执行操作",
          detail: String((params as any).reason || (params as any).command || request.method),
          method: request.method,
          params,
        },
      },
    });
  }
}

function finalAnswerOf(turn: any): string | undefined {
  return turn?.items?.slice?.().reverse().find((item: any) => item?.type === "agentMessage" && item?.phase === "final_answer")?.text;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function codexEvents(method: string, params: any): AgentRuntimeEvent[] {
  if (method === "turn/started") return [{ type: "turn.started", sessionId: String(params?.threadId || params?.turn?.threadId || ""), turnId: String(params?.turn?.id || "") }];
  if (method === "item/completed" && params?.item?.type === "agentMessage") {
    return [{ type: "assistant.message", text: String(params.item.text || ""), final: params.item.phase === "final_answer" }];
  }
  if (method === "item/started" && params?.item?.type === "commandExecution") {
    return [{ type: "tool.started", callId: String(params.item.id || params.item.command || "command"), toolName: "command", summary: params.item.command }];
  }
  if (method === "item/started" && params?.item?.type === "fileChange") {
    return [{ type: "tool.started", callId: String(params.item.id || "file-change"), toolName: "file-change", summary: "正在修改文件" }];
  }
  if (method === "item/completed" && ["commandExecution", "fileChange"].includes(params?.item?.type)) {
    return [{ type: "tool.completed", callId: String(params.item.id || params.item.command || params.item.type), toolName: params.item.type === "fileChange" ? "file-change" : "command", success: params.item.status === "completed" }];
  }
  if (method === "turn/completed") {
    const status = params?.turn?.status;
    return [{
      type: "turn.completed",
      outcome: status === "completed" ? "completed" : status === "interrupted" ? "interrupted" : "failed",
      finalAnswer: finalAnswerOf(params?.turn),
      error: params?.turn?.error?.message,
    }];
  }
  if (method === "error") return [{ type: "diagnostic", level: "error", message: params?.error?.message || "Codex 发生错误" }];
  return [];
}
