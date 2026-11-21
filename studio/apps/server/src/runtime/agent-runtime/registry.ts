import type {
  AgentGlobalSettings,
  AgentModelOption,
  AgentProviderPreset,
  AgentReasoningEffort,
  AgentRuntimeDescriptor,
  AgentRuntimeId,
  AgentRuntimePreference,
  UpdateAgentGlobalSettings,
  VaultConfig,
} from "@the-way-here/shared";
import { AgentSettingsStore, AgentSettingsValidationError, type AgentSettingsSnapshot } from "./agent-settings-store.js";
import { CodexRuntimeAdapter } from "./codex-runtime-adapter.js";
import { PiRuntimeAdapter } from "./pi/pi-runtime-adapter.js";
import { listThirdPartyProviderPresets } from "./third-party-provider-catalog.js";
import { hasDataConsent, protectRuntime } from "./data-consent.js";
import type { AgentRuntime, AgentRuntimeEnvelope, AgentRuntimeProvider, AgentRuntimeSettings, ResolvedAgentSelection } from "./types.js";

export class AgentRuntimeRegistry implements AgentRuntimeProvider, AgentRuntimeSettings {
  private readonly runtimes = new Map<AgentRuntimeId, AgentRuntime>();
  private readonly listeners = new Set<(envelope: AgentRuntimeEnvelope) => void>();
  private readonly enabled: Record<AgentRuntimeId, boolean>;
  private readonly pi: PiRuntimeAdapter;
  private updateQueue: Promise<unknown> = Promise.resolve();
  private readonly descriptions = new Map<AgentRuntimeId, Promise<AgentRuntimeDescriptor>>();
  private sharedKeyRefresh?: NodeJS.Timeout;
  private readonly protectedRuntimes: Array<ReturnType<typeof protectRuntime>> = [];

  private constructor(
    config: VaultConfig["agents"],
    private readonly settingsStore: AgentSettingsStore,
    private globalSettings: AgentSettingsSnapshot,
    vaultRoot: string,
  ) {
    this.enabled = {
      codex: config.runtimes.codex.enabled,
      pi: config.runtimes.pi.enabled,
    };
    this.pi = new PiRuntimeAdapter(vaultRoot, config.runtimes.pi.enabled, globalSettings.provider ? [globalSettings.provider] : []);
    this.register(new CodexRuntimeAdapter(process.env.TWH_CODEX_COMMAND || config.runtimes.codex.command, { allowTools: () => hasDataConsent("codex", this.globalSettings.public) }));
    this.register(this.pi);
    if (process.env.TWH_DESKTOP_SECURE_SETTINGS === "1") { this.sharedKeyRefresh = setInterval(() => { void this.refreshSharedKeys().catch(() => undefined); }, 15_000); this.sharedKeyRefresh.unref(); }
  }

  static async create(config: VaultConfig["agents"], vaultRoot: string): Promise<AgentRuntimeRegistry> {
    const settingsStore = new AgentSettingsStore(config, vaultRoot);
    const settings = await settingsStore.load();
    return new AgentRuntimeRegistry(config, settingsStore, settings, vaultRoot);
  }

  async catalog(refresh = false): Promise<AgentRuntimeDescriptor[]> {
    if (refresh) this.descriptions.clear();
    return Promise.all([...this.runtimes.keys()].map(id => this.describe(id)));
  }

  private describe(id: AgentRuntimeId): Promise<AgentRuntimeDescriptor> {
    const cached = this.descriptions.get(id);
    if (cached) return cached;
    const unavailable = (reason: string): AgentRuntimeDescriptor =>
      ({ id, displayName: runtimeName(id), available: false, reason, models: [] });
    const runtime = this.runtimes.get(id);
    if (!this.enabled[id] || !runtime) return Promise.resolve(unavailable("运行时未启用"));
    const descriptor = runtime.inspect().catch(error => unavailable(error instanceof Error ? error.message : "运行时初始化失败"));
    this.descriptions.set(id, descriptor);
    return descriptor;
  }

  settings(): AgentGlobalSettings {
    return this.globalSettings.public;
  }

  providerPresets(): AgentProviderPreset[] {
    return listThirdPartyProviderPresets();
  }

  updateSettings(input: UpdateAgentGlobalSettings): Promise<AgentGlobalSettings> {
    const update = this.updateQueue.catch(() => undefined).then(() => this.applySettings(input));
    this.updateQueue = update;
    return update;
  }

  private async applySettings(input: UpdateAgentGlobalSettings): Promise<AgentGlobalSettings> {
    if (input.runtimeId === "pi" && !this.enabled.pi) throw new AgentSettingsValidationError("此工作区未启用第三方模型运行方式");
    const previousKey = this.globalSettings.provider?.apiKey;
    const next = await this.settingsStore.update(input);
    this.globalSettings = next;
    await Promise.all(this.protectedRuntimes.filter(runtime => !hasDataConsent(runtime.id, next.public) || runtime.id === "pi" && previousKey !== next.provider?.apiKey).map(runtime => runtime.revoke()));
    this.pi.configure(this.enabled.pi, next.provider ? [next.provider] : []);
    this.descriptions.delete("pi");
    return next.public;
  }

  async resolve(preference: AgentRuntimePreference | undefined, requestedModel: string | undefined, requestedEffort: AgentReasoningEffort | undefined): Promise<ResolvedAgentSelection> {
    await this.refreshSharedKeys();
    const preferredRuntime = preference && preference !== "auto" ? preference : this.globalSettings.public.runtimeId;
    const preferred = await this.describe(preferredRuntime);
    let descriptor = preferred.available && preferred.models.length ? preferred : undefined;
    if (!descriptor && requestedModel) {
      const fallback = await this.describe(preferredRuntime === "codex" ? "pi" : "codex");
      if (fallback.available && fallback.models.some(candidate => candidate.id === requestedModel)) descriptor = fallback;
    }
    if (!descriptor) {
      throw new Error(`${runtimeName(preferredRuntime)}当前不可用，请先完成全局 AI 设置`);
    }
    let model: AgentModelOption | undefined;
    const configured = descriptor.id === "pi" ? this.globalSettings.public.thirdParty : this.globalSettings.public[descriptor.id];
    const configuredModel = configured?.model;
    if (requestedModel) {
      model = descriptor.models.find((entry) => entry.id === requestedModel);
      if (!model) throw new Error(`${descriptor.displayName} 中不存在模型：${requestedModel}`);
    } else {
      model = descriptor.models.find((entry) => entry.id === configuredModel || entry.id.endsWith(`/${configuredModel}`));
    }
    model ||= descriptor.models[0];
    if (!model) throw new Error(`${descriptor.displayName} 没有可用模型`);
    const supported = model.supportedReasoningEfforts.length ? model.supportedReasoningEfforts : ["off" as const];
    const configuredEffort = configured?.effort;
    const preferredEffort = requestedEffort || configuredEffort;
    const effort = preferredEffort && supported.includes(preferredEffort)
      ? preferredEffort
      : model.defaultReasoningEffort && supported.includes(model.defaultReasoningEffort)
        ? model.defaultReasoningEffort
        : supported.includes("high") ? "high" : supported[0]!;
    return { runtime: this.require(descriptor.id), runtimeId: descriptor.id, model, effort };
  }

  require(id: AgentRuntimeId): AgentRuntime {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Agent 运行时不存在：${id}`);
    return runtime;
  }

  subscribe(listener: (envelope: AgentRuntimeEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    clearInterval(this.sharedKeyRefresh);
    for (const runtime of this.runtimes.values()) runtime.close();
    this.listeners.clear();
  }

  mobileKeyStatus(providerId: string) { return this.settingsStore.sharedKeyStatus(providerId); }
  async changeMobileKey(providerId: string, action: "publish" | "pull" | "remove" | "local") {
    await this.settingsStore.changeSharedKey(providerId, action);
    await this.refreshSharedKeys();
    return this.settingsStore.sharedKeyStatus(providerId);
  }
  private refreshSharedKeys(): Promise<void> {
    const work = this.updateQueue.catch(() => undefined).then(async () => {
      const next = await this.settingsStore.load();
      if (next.provider?.apiKey !== this.globalSettings.provider?.apiKey || next.provider?.id !== this.globalSettings.provider?.id) {
        await Promise.all(this.protectedRuntimes.filter(runtime => runtime.id === "pi").map(runtime => runtime.revoke()));
        this.pi.configure(this.enabled.pi, next.provider ? [next.provider] : []);
        this.descriptions.delete("pi");
      }
      this.globalSettings = next;
    });
    this.updateQueue = work.catch(() => undefined); return work;
  }

  private register(runtime: AgentRuntime): void {
    const protectedRuntime = protectRuntime(runtime, () => this.globalSettings.public);
    this.protectedRuntimes.push(protectedRuntime);
    this.runtimes.set(runtime.id, protectedRuntime);
    runtime.subscribe((envelope) => {
      for (const listener of this.listeners) listener(envelope);
    });
  }
}

function runtimeName(id: AgentRuntimeId): string {
  return id === "pi" ? "第三方模型" : "Codex";
}
