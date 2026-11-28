import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { AgentProviderConfig, AgentProviderProtocol, AgentRuntimeConfig, VaultConfig } from "@the-way-here/shared";
import { toPosix } from "./page-paths.js";
import { expandHomePath } from "./content-base.js";

const DEFAULT_CONFIG: VaultConfig = {
  version: 3,
  name: "The Way Here",
  knowledgeBaseId: "default",
  knowledgeBases: [{ id: "default", name: "The Way Here" }],
  adapter: "personal-growth",
  paths: {
    wiki: "wiki",
    sources: "sources",
    skills: "skills",
    tools: "tools",
    agentInstructions: "AGENTS.md",
  },
  views: {},
  agents: {
    defaultRuntime: "auto",
    runtimes: {
      codex: { enabled: true, command: "codex", transport: "stdio" },
      pi: { enabled: true, providers: [] },
    },
  },
  validation: { commands: [] },
};

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validatedRelativePath(root: string, value: unknown, label: string, boundaryLabel: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`配置 ${label} 必须是非空路径`);
  const relative = toPosix(value.trim()).replace(/^\.\//, "").replace(/\/$/, "");
  if (path.isAbsolute(relative)) throw new Error(`配置 ${label} 必须使用相对路径`);
  const resolved = path.resolve(root, relative);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error(`配置 ${label} ${boundaryLabel}`);
  return relative;
}

/** Content root: an absolute directory outside the workspace that hosts user content.
 * The literal value `workspace` anchors that entry back to the workspace root
 * (used to keep app-managed demo content local while personal content syncs elsewhere). */
async function normalizeStorageContentRoot(value: unknown, vaultRoot: string): Promise<{ contentRoot: string } | undefined> {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("配置 storage 必须是对象");
  if (value.contentRoot === undefined) return undefined;
  if (value.contentRoot === "workspace") return { contentRoot: path.resolve(vaultRoot) };
  const raw = typeof value.contentRoot === "string" ? expandHomePath(value.contentRoot.trim()) : "";
  if (!raw || !path.isAbsolute(raw)) throw new Error("配置 storage.contentRoot 必须是绝对路径或 workspace（支持 ~ 前缀）");
  const resolved = path.resolve(raw);
  const workspace = path.resolve(vaultRoot);
  if (resolved === workspace || resolved.startsWith(`${workspace}${path.sep}`) || workspace.startsWith(`${resolved}${path.sep}`)) {
    throw new Error("配置 storage.contentRoot 不能位于工作区内或包含工作区");
  }
  let info;
  try { info = await stat(resolved); }
  catch (error: any) { if (error?.code === "ENOENT") throw new Error(`配置 storage.contentRoot 指向的目录不存在：${resolved}`); throw error; }
  if (!info.isDirectory()) throw new Error(`配置 storage.contentRoot 必须是目录：${resolved}`);
  return { contentRoot: resolved };
}

const providerProtocols = new Set<AgentProviderProtocol>(["openai-completions", "openai-responses", "anthropic-messages"]);

function normalizeProviderConfig(value: unknown, label: string): AgentProviderConfig {
  if (!isRecord(value)) throw new Error(`配置 ${label} 必须是对象`);
  if (["apiKey", "token", "secret"].some((field) => value[field] !== undefined)) {
    throw new Error(`配置 ${label} 不得保存明文密钥；请使用 apiKeyEnv 引用环境变量`);
  }
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error(`配置 ${label}.id 无效`);
  const protocol = value.protocol as AgentProviderProtocol;
  if (!providerProtocols.has(protocol)) throw new Error(`配置 ${label}.protocol 不受支持`);
  const baseUrl = typeof value.baseUrl === "string" ? value.baseUrl.trim().replace(/\/$/, "") : "";
  try {
    const parsed = new URL(baseUrl);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error();
  } catch {
    throw new Error(`配置 ${label}.baseUrl 必须是 HTTP(S) 地址`);
  }
  const apiKeyEnv = value.apiKeyEnv === undefined ? undefined : String(value.apiKeyEnv).trim();
  if (apiKeyEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) throw new Error(`配置 ${label}.apiKeyEnv 无效`);
  if (!Array.isArray(value.models) || !value.models.length) throw new Error(`配置 ${label}.models 至少需要一个模型`);
  const models = value.models.map((model: unknown, index: number) => {
    if (!isRecord(model)) throw new Error(`配置 ${label}.models[${index}] 必须是对象`);
    const modelId = typeof model.id === "string" ? model.id.trim() : "";
    if (!modelId) throw new Error(`配置 ${label}.models[${index}].id 不能为空`);
    const contextWindow = Number(model.contextWindow);
    const maxOutputTokens = Number(model.maxOutputTokens);
    if (!Number.isInteger(contextWindow) || contextWindow <= 0) throw new Error(`配置 ${label}.models[${index}].contextWindow 无效`);
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) throw new Error(`配置 ${label}.models[${index}].maxOutputTokens 无效`);
    if (model.inputModalities !== undefined && (!Array.isArray(model.inputModalities) || !model.inputModalities.length || model.inputModalities.some((value) => value !== "text" && value !== "image"))) throw new Error(`配置 ${label}.models[${index}].inputModalities 无效`);
    return {
      id: modelId,
      displayName: String(model.displayName || modelId),
      reasoning: Boolean(model.reasoning),
      contextWindow,
      maxOutputTokens,
      inputModalities: (model.inputModalities || ["text"]) as Array<"text" | "image">,
    };
  });
  return { id, name: value.name ? String(value.name) : undefined, protocol, baseUrl, apiKeyEnv, models };
}

function normalizeAgentConfig(raw: Record<string, any>, selected: Record<string, any>): AgentRuntimeConfig {
  const legacyCodex = { ...DEFAULT_CONFIG.agents.runtimes.codex, ...(isRecord(raw.codex) ? raw.codex : {}), ...(isRecord(selected.codex) ? selected.codex : {}) };
  const configured = isRecord(raw.agents) ? raw.agents : {};
  const runtimes = isRecord(configured.runtimes) ? configured.runtimes : {};
  const codex = { ...legacyCodex, ...(isRecord(runtimes.codex) ? runtimes.codex : {}) };
  if (typeof codex.enabled !== "boolean" || typeof codex.command !== "string" || codex.transport !== "stdio") {
    throw new Error("配置 agents.runtimes.codex 必须包含 enabled、command 和 stdio transport");
  }
  const rawPi = { ...DEFAULT_CONFIG.agents.runtimes.pi, ...(isRecord(runtimes.pi) ? runtimes.pi : {}) };
  if (typeof rawPi.enabled !== "boolean" || !Array.isArray(rawPi.providers)) throw new Error("配置 agents.runtimes.pi 必须包含 enabled 和 providers");
  const providers = rawPi.providers.map((provider: unknown, index: number) => normalizeProviderConfig(provider, `agents.runtimes.pi.providers[${index}]`));
  if (new Set(providers.map((provider) => provider.id)).size !== providers.length) throw new Error("配置 agents.runtimes.pi.providers 的 id 不能重复");
  const defaultRuntime = configured.defaultRuntime ?? DEFAULT_CONFIG.agents.defaultRuntime;
  if (!new Set(["auto", "codex", "pi"]).has(defaultRuntime)) throw new Error("配置 agents.defaultRuntime 必须是 auto、codex 或 pi");
  return {
    defaultRuntime,
    runtimes: {
      codex: { enabled: codex.enabled, command: codex.command, transport: "stdio" },
      pi: { enabled: rawPi.enabled, providers },
    },
  };
}

export async function loadVaultConfig(vaultRoot: string, requestedKnowledgeBase?: string): Promise<VaultConfig> {
  const configPath = path.join(vaultRoot, "the-way-here.config.yaml");
  let raw: Record<string, any> = {};
  try {
    const parsed = YAML.parse(await readFile(configPath, "utf8"));
    if (parsed !== undefined && parsed !== null && !isRecord(parsed)) throw new Error("the-way-here.config.yaml 顶层必须是对象");
    raw = parsed || {};
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  const configuredBases = isRecord(raw.knowledgeBases) ? raw.knowledgeBases : undefined;
  const configuredIds = Object.keys(configuredBases || {});
  const configuredDefault = String(raw.defaultKnowledgeBase || configuredIds[0] || "default");
  const customIds = configuredIds.filter((id) => id.toLowerCase() !== "demo");
  const preferredCustomId = customIds.includes(configuredDefault) ? configuredDefault : customIds[0];
  const knowledgeBaseId = requestedKnowledgeBase || preferredCustomId || (configuredIds.includes(configuredDefault) ? configuredDefault : configuredIds[0]) || "default";
  if (!/^[A-Za-z0-9_-]+$/.test(knowledgeBaseId)) throw new Error(`知识库 ID 无效：${knowledgeBaseId}`);
  const version = Number(raw.version ?? DEFAULT_CONFIG.version);
  if (!Number.isInteger(version) || version < 1 || version > 3) throw new Error(`不支持的配置版本：${raw.version}`);
  if (configuredBases && !configuredBases[knowledgeBaseId]) {
    throw new Error(`知识库不存在：${knowledgeBaseId}。可用知识库：${Object.keys(configuredBases).join("、")}`);
  }
  const selected = configuredBases?.[knowledgeBaseId] || {};
  if (!isRecord(selected)) throw new Error(`知识库 ${knowledgeBaseId} 的配置必须是对象`);
  const knowledgeBases = configuredBases
    ? Object.entries(configuredBases).map(([id, value]) => ({ id, name: String(value?.name || id), description: value?.description ? String(value.description) : undefined }))
    : [{ id: "default", name: String(raw.name || DEFAULT_CONFIG.name) }];
  const mergedPaths = { ...DEFAULT_CONFIG.paths, ...(isRecord(raw.paths) ? raw.paths : {}), ...(isRecord(selected.paths) ? selected.paths : {}) };
  // A knowledge base may anchor its content back to the workspace (bundled demo)
  // even when the global content root points at a synced folder.
  const storage = await normalizeStorageContentRoot(selected.storage ?? raw.storage, vaultRoot);
  const contentRoot = storage?.contentRoot ?? path.resolve(vaultRoot);
  const contentBoundary = storage ? "超出内容根边界" : "超出工作区边界";
  const paths = {
    wiki: validatedRelativePath(contentRoot, mergedPaths.wiki, `${knowledgeBaseId}.paths.wiki`, contentBoundary),
    sources: validatedRelativePath(contentRoot, mergedPaths.sources, `${knowledgeBaseId}.paths.sources`, contentBoundary),
    skills: validatedRelativePath(vaultRoot, mergedPaths.skills, "paths.skills", "超出工作区边界"),
    tools: validatedRelativePath(vaultRoot, mergedPaths.tools, "paths.tools", "超出工作区边界"),
    agentInstructions: validatedRelativePath(vaultRoot, mergedPaths.agentInstructions, "paths.agentInstructions", "超出工作区边界"),
  };
  if (paths.wiki === paths.sources) throw new Error(`知识库 ${knowledgeBaseId} 的 Wiki 与来源目录不能相同`);
  const commands = selected.validation?.commands ?? raw.validation?.commands ?? [];
  if (!Array.isArray(commands) || commands.some((command) => !Array.isArray(command) || command.some((part) => typeof part !== "string"))) {
    throw new Error(`知识库 ${knowledgeBaseId} 的 validation.commands 必须是字符串数组列表`);
  }
  const views = { ...DEFAULT_CONFIG.views, ...(isRecord(raw.views) ? raw.views : {}), ...(isRecord(selected.views) ? selected.views : {}) };
  if (Object.values(views).some((value) => typeof value !== "boolean")) throw new Error("配置 views 的值必须是布尔值");
  const agents = normalizeAgentConfig(raw, selected);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    ...selected,
    version,
    knowledgeBaseId: configuredBases ? knowledgeBaseId : "default",
    knowledgeBases,
    name: String(selected.name || raw.name || DEFAULT_CONFIG.name),
    adapter: String(selected.adapter || raw.adapter || DEFAULT_CONFIG.adapter),
    storage,
    paths,
    sourceConnections: normalizeSourceConnections(selected.sourceConnections),
    views,
    agents,
    validation: {
      commands: commands.map((command: string[]) => [...command]),
    },
  };
}

function normalizeSourceConnections(value: unknown): NonNullable<VaultConfig["sourceConnections"]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) throw new Error("来源目录配置无效");
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !/^[a-z0-9-]+$/.test(entry.id) || ids.has(entry.id)
      || (entry.aiWritable !== undefined && typeof entry.aiWritable !== "boolean")
      || typeof entry.path !== "string" || !path.isAbsolute(entry.path) || typeof entry.name !== "string" || typeof entry.autoBuild !== "boolean") throw new Error("来源目录配置无效");
    ids.add(entry.id);
    return { id: entry.id, path: path.normalize(entry.path), name: entry.name, autoBuild: entry.autoBuild, aiWritable: entry.aiWritable === true };
  });
}
