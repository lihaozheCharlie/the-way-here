import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { stateRootForVault } from "@the-way-here/run-manager";
import type {
  AgentGlobalSettings,
  AgentProviderProtocol,
  AgentReasoningEffort,
  AgentRuntimeConfig,
  UpdateAgentGlobalSettings,
} from "@the-way-here/shared";
import type { PiProviderConfig } from "./pi/pi-model-catalog.js";
import { desktopSecretCodec, desktopSharedKeychain, type SharedKeychain, type SecretCodec } from "./desktop-secret-codec.js";
import { dataConsentVersion } from "./data-consent.js";
import {
  defaultThirdPartySelection,
  findThirdPartySelection,
  hasThirdPartyProvider,
  inferThirdPartySelection,
  piProviderFromPreset,
} from "./third-party-provider-catalog.js";

const settingsVersion = 2;
const efforts = new Set<AgentReasoningEffort>(["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

type StoredAgentSettings = {
  dataConsent?: AgentGlobalSettings["dataConsent"];
  version: 2;
  runtimeId: "codex" | "pi";
  codex: {
    model: string;
    effort: AgentReasoningEffort;
  };
  thirdParty: {
    providerId: string;
    model: string;
    effort: AgentReasoningEffort;
    apiKeys: Record<string, string>;
    keySources?: Record<string, "local" | "shared">;
  };
};

type LegacyAgentSettings = {
  version: 1;
  runtimeId?: unknown;
  codex?: unknown;
  thirdParty?: unknown;
};

export type AgentSettingsSnapshot = {
  public: AgentGlobalSettings;
  provider?: PiProviderConfig;
};

export class AgentSettingsValidationError extends Error {}

export class AgentSettingsStore {
  private readonly filePath: string;
  private loaded?: StoredAgentSettings;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: AgentRuntimeConfig,
    vaultRoot: string,
    stateRoot = stateRootForVault(vaultRoot),
    private readonly codec: SecretCodec | undefined = desktopSecretCodec(),
    private readonly sharedKeychain: SharedKeychain | undefined = desktopSharedKeychain(),
  ) {
    this.filePath = path.join(stateRoot, "agent-settings.json");
  }

  async load(): Promise<AgentSettingsSnapshot> {
    if (!this.loaded) this.loaded = await this.readStored();
    return this.effectiveSnapshot(this.loaded);
  }

  update(input: UpdateAgentGlobalSettings): Promise<AgentSettingsSnapshot> {
    const task = this.mutationQueue.then(() => this.persistUpdate(input));
    this.mutationQueue = task.catch(() => undefined);
    return task;
  }

  private async persistUpdate(input: UpdateAgentGlobalSettings): Promise<AgentSettingsSnapshot> {
    const current = this.loaded || await this.readStored();
    const next = normalizeUpdate(input, current);
    const selectedProvider = next.thirdParty.providerId;
    if (input.thirdParty?.clearApiKey && current.thirdParty.keySources?.[selectedProvider] === "shared") {
      if (!this.sharedKeychain) throw new AgentSettingsValidationError("共享钥匙串不可用，未更改来源或本机备份。");
      await this.sharedKeychain.remove(selectedProvider);
      // The existing Remove Key action removes the effective shared item, never its recovery backup.
      if (current.thirdParty.apiKeys[selectedProvider]) next.thirdParty.apiKeys[selectedProvider] = current.thirdParty.apiKeys[selectedProvider]!;
    }
    await this.writeStored(next);
    this.loaded = next;
    return this.effectiveSnapshot(next);
  }

  async sharedKeyStatus(providerId: string) {
    if (!hasThirdPartyProvider(providerId)) throw new AgentSettingsValidationError("厂商无效");
    const stored = this.loaded ||= await this.readStored();
    const source = stored.thirdParty.keySources?.[providerId] || "local";
    const localConfigured = Boolean(stored.thirdParty.apiKeys[providerId]);
    if (!this.sharedKeychain) return { available: false, reason: "此宿主没有共享钥匙串能力；本机加密密钥保留。", source, localConfigured, sharedConfigured: false };
    try {
      const capability = await this.sharedKeychain.status();
      if (!capability.available) return { available: false, reason: capability.reason, source, localConfigured, sharedConfigured: false };
      const token = await this.sharedKeychain.read(providerId);
      return { available: true, source, localConfigured, sharedConfigured: Boolean(token), suffix: token?.slice(-4) };
    } catch { return { available: false, reason: "共享钥匙串暂不可用，未使用本机备份替代。", source, localConfigured, sharedConfigured: false }; }
  }

  changeSharedKey(providerId: string, action: "publish" | "pull" | "remove" | "local"): Promise<void> {
    const task = this.mutationQueue.then(async () => {
      if (!hasThirdPartyProvider(providerId)) throw new AgentSettingsValidationError("厂商无效");
      const stored = this.loaded ||= await this.readStored();
      const next = structuredClone(stored); next.thirdParty.keySources ||= {};
      if (action === "local") { next.thirdParty.keySources[providerId] = "local"; }
      else {
        if (!this.sharedKeychain) throw new AgentSettingsValidationError("此安装包没有共享钥匙串能力，本机备份保留。");
        const capability = await this.sharedKeychain.status();
        if (!capability.available) throw new AgentSettingsValidationError(capability.reason || "共享钥匙串不可用");
        if (action === "publish") {
          const token = stored.thirdParty.apiKeys[providerId];
          if (!token) throw new AgentSettingsValidationError("没有可发布的本机密钥，请先在 AI 设置配置。");
          await this.sharedKeychain.write(providerId, token); next.thirdParty.keySources[providerId] = "shared";
        } else if (action === "pull") {
          if (!await this.sharedKeychain.read(providerId)) throw new AgentSettingsValidationError("共享钥匙串中没有此厂商密钥，请先在 iPhone 保存或从本机发布。");
          next.thirdParty.keySources[providerId] = "shared";
        } else if (action === "remove") { await this.sharedKeychain.remove(providerId); }
      }
      await this.writeStored(next); this.loaded = next;
    });
    this.mutationQueue = task.catch(() => undefined); return task;
  }

  private async effectiveSnapshot(stored: StoredAgentSettings): Promise<AgentSettingsSnapshot> {
    const effective = structuredClone(stored);
    for (const [providerId, source] of Object.entries(stored.thirdParty.keySources || {})) {
      if (source !== "shared") continue;
      delete effective.thirdParty.apiKeys[providerId]; // Never silently fall back to the encrypted backup.
      if (providerId === stored.thirdParty.providerId && this.sharedKeychain) {
        try { const token = await this.sharedKeychain.read(providerId); if (token) effective.thirdParty.apiKeys[providerId] = token; }
        catch { /* Missing capability/key revokes the effective provider without losing local backup. */ }
      }
    }
    return snapshotOf(effective);
  }

  private async readStored(): Promise<StoredAgentSettings> {
    try {
      const envelope = JSON.parse(await readFile(this.filePath, "utf8"));
      if (envelope.version === 3) {
        if (!this.codec || typeof envelope.encrypted !== "string") throw new Error("无法解密 AI 设置，请使用原桌面应用和系统钥匙串打开");
        return normalizeStored(JSON.parse(await this.codec.decrypt(envelope.encrypted)));
      }
      const stored = normalizeStored(envelope);
      if (this.codec) await this.writeStored(stored);
      return stored;
    } catch (error: any) {
      if (error?.code === "ENOENT") return defaultsFrom(this.config);
      if (error instanceof AgentSettingsValidationError) throw error;
      throw new Error("全局 Agent 设置无法读取或解密，原文件保留；请检查安装版本与系统钥匙串。");
    }
  }

  private async writeStored(value: StoredAgentSettings): Promise<void> {
    const stored = this.codec ? { version: 3, encrypted: await this.codec.encrypt(JSON.stringify(value)) } : value;
    await atomicWrite(this.filePath, stored);
  }
}

function defaultsFrom(config: AgentRuntimeConfig): StoredAgentSettings {
  const configured = config.runtimes.pi.providers[0];
  const configuredModel = configured?.models[0];
  const selection = configured && configuredModel
    ? inferThirdPartySelection(configured.protocol, configured.baseUrl, configuredModel.id)
    : defaultThirdPartySelection();
  const configuredKey = configured?.apiKeyEnv ? process.env[configured.apiKeyEnv] : undefined;
  return {
    version: settingsVersion,
    runtimeId: config.defaultRuntime === "pi" ? "pi" : "codex",
    codex: { model: "", effort: "high" },
    thirdParty: {
      ...selection,
      apiKeys: configuredKey ? { [selection.providerId]: configuredKey } : {},
    },
  };
}

function normalizeStored(value: unknown): StoredAgentSettings {
  if (!isRecord(value)) throw new AgentSettingsValidationError("全局 Agent 设置无效");
  if (value.version === 1) return migrateLegacy(value as LegacyAgentSettings);
  if (value.version !== settingsVersion) throw new AgentSettingsValidationError("全局 Agent 设置版本无效");
  const runtimeId = runtime(value.runtimeId);
  const codex = isRecord(value.codex) ? value.codex : {};
  const thirdParty = isRecord(value.thirdParty) ? value.thirdParty : {};
  const selection = validateSelection(thirdParty.providerId, thirdParty.model, thirdParty.effort);
  return {
    version: settingsVersion,
    runtimeId,
    dataConsent: normalizeConsent(value.dataConsent),
    codex: {
      model: text(codex.model, "Codex 模型", false),
      effort: effort(codex.effort, "Codex 思考深度"),
    },
    thirdParty: { ...selection, apiKeys: apiKeys(thirdParty.apiKeys), keySources: normalizeKeySources(thirdParty.keySources) },
  };
}

function migrateLegacy(value: LegacyAgentSettings): StoredAgentSettings {
  const codex = isRecord(value.codex) ? value.codex : {};
  const thirdParty = isRecord(value.thirdParty) ? value.thirdParty : {};
  const selection = inferThirdPartySelection(
    legacyProtocol(thirdParty.protocol),
    typeof thirdParty.baseUrl === "string" ? thirdParty.baseUrl.trim() : "",
    typeof thirdParty.model === "string" ? thirdParty.model.trim() : "",
  );
  const legacyKey = secret(thirdParty.apiKey);
  return {
    version: settingsVersion,
    runtimeId: runtime(value.runtimeId),
    codex: {
      model: text(codex.model, "Codex 模型", false),
      effort: effort(codex.effort, "Codex 思考深度"),
    },
    thirdParty: {
      ...selection,
      apiKeys: legacyKey ? { [selection.providerId]: legacyKey } : {},
    },
  };
}

function normalizeUpdate(input: UpdateAgentGlobalSettings, current: StoredAgentSettings): StoredAgentSettings {
  const raw: unknown = input;
  if (!isRecord(raw)) throw new AgentSettingsValidationError("Agent 设置必须是对象");
  if (raw.dataSharingConsent !== undefined && typeof raw.dataSharingConsent !== "boolean") throw new AgentSettingsValidationError("AI 共享许可必须明确选择同意或撤回");
  const codex: Record<string, unknown> = isRecord(raw.codex) ? raw.codex : {};
  const thirdParty: Record<string, unknown> = isRecord(raw.thirdParty) ? raw.thirdParty : {};
  const runtimeId = runtime(raw.runtimeId);
  const selection = validateSelection(thirdParty.providerId, thirdParty.model, thirdParty.effort);
  const nextKeys = { ...current.thirdParty.apiKeys };
  if (thirdParty.clearApiKey) delete nextKeys[selection.providerId];
  const nextKey = secret(thirdParty.apiKey);
  if (nextKey) nextKeys[selection.providerId] = nextKey;
  return {
    version: settingsVersion,
    runtimeId,
    dataConsent: raw.dataSharingConsent === true
      ? { version: dataConsentVersion, recipientId: runtimeId === "codex" ? "codex" : `pi:${selection.providerId}`, acceptedAt: new Date().toISOString() }
      : raw.dataSharingConsent === false || runtimeId !== current.runtimeId || selection.providerId !== current.thirdParty.providerId
        ? undefined : current.dataConsent,
    codex: {
      model: text(codex.model, "Codex 模型", runtimeId === "codex"),
      effort: effort(codex.effort, "Codex 思考深度"),
    },
    thirdParty: { ...selection, apiKeys: nextKeys, keySources: current.thirdParty.keySources },
  };
}

function snapshotOf(stored: StoredAgentSettings): AgentSettingsSnapshot {
  const apiKey = stored.thirdParty.apiKeys[stored.thirdParty.providerId];
  const ready = Boolean(apiKey && findThirdPartySelection(stored.thirdParty.providerId, stored.thirdParty.model));
  return {
    public: {
      runtimeId: stored.runtimeId,
      dataConsent: stored.dataConsent,
      codex: { ...stored.codex },
      thirdParty: {
        providerId: stored.thirdParty.providerId,
        model: stored.thirdParty.model,
        effort: stored.thirdParty.effort,
        apiKeyConfigured: Boolean(apiKey),
        apiKeyConfiguredProviders: Object.keys(stored.thirdParty.apiKeys).filter((providerId) => Boolean(stored.thirdParty.apiKeys[providerId])),
        ready,
      },
    },
    provider: ready ? piProviderFromPreset(stored.thirdParty.providerId, stored.thirdParty.model, apiKey!) : undefined,
  };
}

function validateSelection(providerValue: unknown, modelValue: unknown, effortValue: unknown) {
  const providerId = text(providerValue, "模型厂商", true);
  const modelId = text(modelValue, "模型", true);
  const selectedEffort = effort(effortValue, "第三方模型思考深度");
  const selection = findThirdPartySelection(providerId, modelId);
  if (!selection) throw new AgentSettingsValidationError("模型厂商或模型不受支持，请重新选择");
  if (!selection.model.supportedReasoningEfforts.includes(selectedEffort)) {
    throw new AgentSettingsValidationError(`${selection.model.displayName} 不支持所选思考深度`);
  }
  return { providerId, model: modelId, effort: selectedEffort };
}

function runtime(value: unknown): "codex" | "pi" {
  if (value === "codex" || value === "pi") return value;
  throw new AgentSettingsValidationError("运行方式必须是 Codex 或第三方模型");
}

function effort(value: unknown, label: string): AgentReasoningEffort {
  if (efforts.has(value as AgentReasoningEffort)) return value as AgentReasoningEffort;
  throw new AgentSettingsValidationError(`${label}无效`);
}

function legacyProtocol(value: unknown): AgentProviderProtocol {
  if (value === "openai-responses" || value === "anthropic-messages") return value;
  return "openai-completions";
}

function text(value: unknown, label: string, required: boolean): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) throw new AgentSettingsValidationError(`${label}不能为空`);
  if (normalized.length > 240) throw new AgentSettingsValidationError(`${label}过长`);
  return normalized;
}

function apiKeys(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new AgentSettingsValidationError("模型密钥设置无效");
  return Object.fromEntries(Object.entries(value).flatMap(([providerId, raw]) => {
    const key = secret(raw);
    return key && hasThirdPartyProvider(providerId) ? [[providerId, key]] : [];
  }));
}

function secret(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new AgentSettingsValidationError("API Key 必须是字符串");
  const normalized = value.trim();
  if (normalized.length > 8_192) throw new AgentSettingsValidationError("API Key 过长");
  return normalized || undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKeySources(value: unknown): Record<string, "local" | "shared"> {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.entries(value).some(([id, source]) => !hasThirdPartyProvider(id) || !["local", "shared"].includes(source as string))) throw new AgentSettingsValidationError("密钥来源设置损坏，原文件已保留；未使用本机密钥替代共享来源。");
  return { ...value } as Record<string, "local" | "shared">;
}

function normalizeConsent(value: unknown): AgentGlobalSettings["dataConsent"] {
  if (!isRecord(value) || value.version !== dataConsentVersion || typeof value.recipientId !== "string" || typeof value.acceptedAt !== "string" || !Number.isFinite(Date.parse(value.acceptedAt))) return undefined;
  return { version: dataConsentVersion, recipientId: value.recipientId, acceptedAt: value.acceptedAt };
}

async function atomicWrite(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}
