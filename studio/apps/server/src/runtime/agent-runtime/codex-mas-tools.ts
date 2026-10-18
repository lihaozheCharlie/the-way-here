import { validateToolArguments } from "@earendil-works/pi-ai";
import type { CodexDynamicTool } from "@the-way-here/codex-bridge";
import { createPiTools } from "./pi/pi-tools.js";
import type { StartAgentExecution } from "./types.js";

// Reuse the same knowledge-base path checks and optimistic writes as the API
// runtime. No shell commands, executable paths or arbitrary host functions are
// exposed to Codex in the Mac App Store build.
export class MasCodexTools {
  private readonly tools;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(input: StartAgentExecution, private readonly allowed: () => boolean) {
    this.tools = createPiTools(input);
  }
  static specifications(input: StartAgentExecution): CodexDynamicTool[] {
    // Keep a stable catalog when a read-only conversation later enters a write
    // task. The live dispatcher, rather than a persisted tool schema, grants
    // permissions for the current run.
    return createPiTools({ ...input, mode: "write", strictReadOnly: false }).map(tool => ({
      type: "function", name: tool.name, description: tool.description, inputSchema: tool.parameters,
    }));
  }
  execute(name: string, args: unknown, callId: string) {
    const task = this.queue.catch(() => undefined).then(async () => {
      if (!this.allowed()) throw new Error("任务已停止或 AI 共享许可已撤回");
      const tool = this.tools.find(tool => tool.name === name);
      if (!tool) throw new Error("当前任务不允许此工具（只读任务不能写入）");
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("工具参数必须是对象");
      const properties = (tool.parameters as { properties?: Record<string, unknown> }).properties || {};
      if (Object.keys(args).some(key => !Object.hasOwn(properties, key))) throw new Error("工具包含未允许的参数");
      const validated = validateToolArguments(tool, { type: "toolCall", id: callId, name, arguments: args as Record<string, unknown> });
      if (!this.allowed()) throw new Error("任务已停止或 AI 共享许可已撤回");
      const result = await tool.execute(callId, validated);
      return { success: true, contentItems: result.content.filter(item => item.type === "text").map(item => ({ type: "inputText" as const, text: item.text })) };
    });
    this.queue = task;
    return task;
  }
}
