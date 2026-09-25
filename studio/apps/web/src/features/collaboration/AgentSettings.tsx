import { SelectInput, TextInput } from "../../shared/form-controls";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  AgentGlobalSettings,
  AgentModelOption,
  AgentProviderPreset,
  AgentReasoningEffort,
  AgentRuntimeDescriptor,
  AgentRuntimeId,
  UpdateAgentGlobalSettings,
} from "@the-way-here/shared";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { Icon } from "../../shared/ui";
import "./agent-settings.css";

export const reasoningLabels: Record<AgentReasoningEffort, string> = {
  off: "关闭", minimal: "最少", low: "快速", medium: "标准", high: "深入", xhigh: "更深入", max: "最大", ultra: "极致",
};

const defaultAgentModel = "gpt-5.6-sol";
const fallbackProvider: AgentProviderPreset = {
  id: "deepseek",
  displayName: "DeepSeek",
  description: "深度求索官方 API",
  models: [{
    id: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    description: "旗舰推理与 Agent",
    supportedReasoningEfforts: ["off", "low", "medium", "high", "max"],
    defaultReasoningEffort: "high",
  }],
};
const defaultSettings: AgentGlobalSettings = {
  runtimeId: "codex",
  codex: { model: defaultAgentModel, effort: "high" },
  thirdParty: {
    providerId: fallbackProvider.id,
    model: fallbackProvider.models[0]!.id,
    effort: fallbackProvider.models[0]!.defaultReasoningEffort,
    apiKeyConfigured: false,
    apiKeyConfiguredProviders: [],
    ready: false,
  },
};

const fallbackRuntime: AgentRuntimeDescriptor = {
  id: "codex",
  displayName: "Codex",
  available: true,
  models: [{ runtimeId: "codex", id: defaultAgentModel, displayName: "GPT-5.6-Sol", supportedReasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"] }],
};

export type AgentSelection = {
  runtimeId: AgentRuntimeId;
  model: string;
  effort: AgentReasoningEffort;
};

export type AgentSettingsController = ReturnType<typeof useAgentSelection>;

export function useAgentSelection(revision: number) {
  const { data: savedSettings, loading: settingsLoading, error: loadError } = useApi<AgentGlobalSettings>("/api/agent-settings", revision);
  const { data: catalog } = useApi<AgentRuntimeDescriptor[]>("/api/agent-runtimes", revision);
  const { data: loadedProviders, loading: providersLoading } = useApi<AgentProviderPreset[]>("/api/agent-provider-presets", revision);
  const runtimes = catalog?.length ? catalog : [fallbackRuntime];
  const providers = loadedProviders?.length ? loadedProviders : [fallbackProvider];
  const [draft, setDraft] = useState<AgentGlobalSettings>(defaultSettings);
  const [baseline, setBaseline] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  const apiKeyRef = useRef(apiKey);
  const clearApiKeyRef = useRef(clearApiKey);
  const savingRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!savedSettings) return;
    const signature = JSON.stringify(savedSettings);
    if (signature === baselineRef.current || savingRef.current) return;
    if (baselineRef.current && (JSON.stringify(draftRef.current) !== baselineRef.current || apiKeyRef.current || clearApiKeyRef.current)) return;
    draftRef.current = savedSettings;
    baselineRef.current = signature;
    setDraft(savedSettings);
    setBaseline(signature);
    setApiKey("");
    setClearApiKey(false);
    setError("");
  }, [savedSettings]);

  const codexRuntime = runtimes.find((entry) => entry.id === "codex") || fallbackRuntime;
  const codexModels = codexRuntime.models.length ? codexRuntime.models : fallbackRuntime.models;
  const selectedCodexModel = codexModels.find((entry) => entry.id === draft.codex.model) || codexModels[0]!;
  const codexEfforts = effortsOf(selectedCodexModel);
  const selectedProvider = providers.find((entry) => entry.id === draft.thirdParty.providerId) || providers[0]!;
  const selectedThirdPartyModel = selectedProvider.models.find((entry) => entry.id === draft.thirdParty.model) || selectedProvider.models[0]!;
  const thirdPartyEfforts = selectedThirdPartyModel.supportedReasoningEfforts;
  const savedKeyForProvider = draft.thirdParty.apiKeyConfiguredProviders.includes(selectedProvider.id);
  const configuredApiKey = !clearApiKey && (savedKeyForProvider || Boolean(apiKey));
  const dirty = Boolean(baseline) && (JSON.stringify(draft) !== baseline || Boolean(apiKey) || clearApiKey);

  function update(next: (current: AgentGlobalSettings) => AgentGlobalSettings) {
    const value = next(draftRef.current);
    draftRef.current = value;
    setDraft(value);
    setSaved(false);
    setError("");
  }

  function selectRuntime(runtimeId: AgentRuntimeId) {
    update((current) => ({ ...current, runtimeId }));
  }

  function selectCodexModel(model: string) {
    const option = codexModels.find((entry) => entry.id === model) || selectedCodexModel;
    const supported = effortsOf(option);
    update((current) => ({
      ...current,
      codex: { model: option.id, effort: supported.includes(current.codex.effort) ? current.codex.effort : option.defaultReasoningEffort || supported[0]! },
    }));
  }

  function selectProvider(providerId: string) {
    const provider = providers.find((entry) => entry.id === providerId) || providers[0]!;
    const model = provider.models[0]!;
    apiKeyRef.current = "";
    clearApiKeyRef.current = false;
    setApiKey("");
    setClearApiKey(false);
    update((current) => ({
      ...current,
      thirdParty: { ...current.thirdParty, providerId: provider.id, model: model.id, effort: model.defaultReasoningEffort },
    }));
  }

  function selectThirdPartyModel(modelId: string) {
    const model = selectedProvider.models.find((entry) => entry.id === modelId) || selectedThirdPartyModel;
    update((current) => ({
      ...current,
      thirdParty: {
        ...current.thirdParty,
        model: model.id,
        effort: model.supportedReasoningEfforts.includes(current.thirdParty.effort)
          ? current.thirdParty.effort
          : model.defaultReasoningEffort,
      },
    }));
  }

  function selection(settings = draft): AgentSelection {
    if (settings.runtimeId === "codex") {
      const option = codexModels.find((entry) => entry.id === settings.codex.model) || codexModels[0]!;
      const supported = effortsOf(option);
      return { runtimeId: "codex", model: option.id, effort: supported.includes(settings.codex.effort) ? settings.codex.effort : supported[0]! };
    }
    return { runtimeId: "pi", model: `global-third-party/${settings.thirdParty.model}`, effort: settings.thirdParty.effort };
  }

  async function save(includeKey = true): Promise<AgentSelection> {
    if (!baselineRef.current) throw new Error(loadError || "正在读取全局 AI 设置");
    while (true) {
      if (savingRef.current) {
        await savingRef.current;
        continue;
      }
      const current = draftRef.current;
      const currentKey = includeKey ? apiKeyRef.current : "";
      const currentClear = clearApiKeyRef.current;
      const signature = JSON.stringify(current);
      if (signature === baselineRef.current && !currentKey && !currentClear) return selection(current);
      const provider = providers.find((entry) => entry.id === current.thirdParty.providerId) || providers[0]!;
      const model = provider.models.find((entry) => entry.id === current.thirdParty.model) || provider.models[0]!;
      const payload: UpdateAgentGlobalSettings = {
        runtimeId: current.runtimeId,
        codex: { ...current.codex },
        thirdParty: {
          providerId: provider.id,
          model: model.id,
          effort: model.supportedReasoningEfforts.includes(current.thirdParty.effort) ? current.thirdParty.effort : model.defaultReasoningEffort,
          apiKey: currentKey || undefined,
          clearApiKey: currentClear,
        },
      };
      setSaving(true);
      setError("");
      const request = (async () => {
        try {
          const result = await api<AgentGlobalSettings>("/api/agent-settings", { method: "PUT", body: JSON.stringify(payload) });
          baselineRef.current = JSON.stringify(result);
          setBaseline(baselineRef.current);
          if (JSON.stringify(draftRef.current) === signature) {
            draftRef.current = result;
            setDraft(result);
          }
          if (currentKey && apiKeyRef.current === currentKey) { apiKeyRef.current = ""; setApiKey(""); }
          if (clearApiKeyRef.current === currentClear) { clearApiKeyRef.current = false; setClearApiKey(false); }
          setSaved(true);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
          throw reason;
        }
      })();
      savingRef.current = request;
      try { await request; } finally { savingRef.current = null; setSaving(false); }
    }
  }

  useEffect(() => {
    if (!baseline || saving || error || (JSON.stringify(draft) === baseline && !clearApiKey)) return;
    const timer = window.setTimeout(() => { void save(false).catch(() => undefined); }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, baseline, saving, error, apiKey, clearApiKey]);

  const activeSelection = selection();
  return {
    draft,
    providers,
    selectedProvider,
    selectedThirdPartyModel,
    thirdPartyEfforts,
    loading: settingsLoading || providersLoading,
    saving,
    dirty,
    saved,
    error,
    loadError,
    apiKey,
    configuredApiKey,
    codexRuntime,
    codexModels,
    codexEfforts,
    runtimeId: activeSelection.runtimeId,
    model: activeSelection.model,
    effort: activeSelection.effort,
    providerDisplayName: selectedProvider.displayName,
    selectRuntime,
    selectCodexModel,
    selectProvider,
    selectThirdPartyModel,
    setCodexEffort: (effort: AgentReasoningEffort) => update((current) => ({ ...current, codex: { ...current.codex, effort } })),
    setThirdPartyEffort: (effort: AgentReasoningEffort) => update((current) => ({ ...current, thirdParty: { ...current.thirdParty, effort } })),
    setApiKey: (value: string) => { apiKeyRef.current = value; clearApiKeyRef.current = false; setApiKey(value); setClearApiKey(false); setSaved(false); setError(""); },
    removeApiKey: () => { apiKeyRef.current = ""; clearApiKeyRef.current = true; setApiKey(""); setClearApiKey(true); setSaved(false); setError(""); },
    save,
  };
}

export function AgentComposerSettings({ id, agent, runtimeId, label }: { id: string; agent: AgentSettingsController; runtimeId?: AgentRuntimeId; label?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className={`agent-settings-trigger${label ? " is-model-chip" : ""}`} aria-label="AI 设置" title="切换模型与思考深度" onClick={() => dialogRef.current?.showModal()}>{label ? <><span>{label}</span><Icon name="down" size={13} /></> : <Icon name="controls" size={16} />}</button>
    <dialog ref={dialogRef} className="agent-settings-dialog" aria-labelledby={`${id}-heading`} onKeyDown={(event) => { if (event.key === "Escape" || event.key === "Tab") event.stopPropagation(); }}>
      <header className="agent-settings-header"><button type="button" aria-label="返回对话" onClick={() => dialogRef.current?.close()}><Icon name="back" size={18} /></button><h2 id={`${id}-heading`}>AI 设置</h2></header>
      <AiConfiguration id={id} agent={agent} runtimeId={runtimeId} />
    </dialog>
  </>;
}

export function AiConfiguration({ id, agent, runtimeId, heading }: { id: string; agent: AgentSettingsController; runtimeId?: AgentRuntimeId; heading?: ReactNode }) {
  const { draft } = agent;
  const codexSelected = draft.runtimeId === "codex";
  const [editingKey, setEditingKey] = useState(false);
  useEffect(() => { setEditingKey(false); }, [draft.thirdParty.providerId]);

  return <fieldset className="ai-configuration">
    <legend className="sr-only">全局 AI 设置</legend>
    <div className="agent-settings-body">
    {heading}
    {runtimeId && <p className="agent-settings-notice"><Icon name="info" size={14} /><span>模型和思考深度调整从下一轮生效，当前回复不受影响。继续本对话需使用{runtimeId === "codex" ? " Codex" : "第三方模型"}；切换运行方式请开始新对话。</span></p>}
    <h3 className="agent-config-section-title">运行方式</h3>
    <div className="ai-runtime-choices" role="radiogroup" aria-label="选择 Agent 运行方式">
      <button type="button" role="radio" disabled={runtimeId === "pi"} aria-checked={codexSelected} className={codexSelected ? "active" : ""} onClick={() => agent.selectRuntime("codex")}>
        <span className="ai-runtime-mark"><Icon name="spark" size={16} /></span><span><b>Codex</b><small>使用本机 Codex 登录与模型能力</small></span><i data-state={agent.codexRuntime.available ? "good" : "watch"}>{agent.loading ? "读取中" : agent.codexRuntime.available ? "已就绪" : "不可用"}</i>
      </button>
      <button type="button" role="radio" disabled={runtimeId === "codex"} aria-checked={!codexSelected} className={!codexSelected ? "active" : ""} onClick={() => agent.selectRuntime("pi")}>
        <span className="ai-runtime-mark"><Icon name="controls" size={16} /></span><span><b>第三方模型</b><small>使用你选择的模型服务和密钥</small></span><i data-state={agent.configuredApiKey ? "good" : "watch"}>{agent.loading ? "读取中" : agent.apiKey ? "待应用" : agent.configuredApiKey ? "已配置" : "待配置"}</i>
      </button>
    </div>

    {codexSelected ? <div className="ai-config-fields ai-config-fields--codex">
      <label htmlFor={`${id}-codex-model`}><span>模型</span><SelectInput id={`${id}-codex-model`} value={agent.codexModels.some((entry) => entry.id === draft.codex.model) ? draft.codex.model : agent.codexModels[0]?.id} onChange={(event) => agent.selectCodexModel(event.target.value)}>{agent.codexModels.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}</SelectInput></label>
      <label htmlFor={`${id}-codex-effort`}><span>思考深度</span><SelectInput id={`${id}-codex-effort`} value={agent.codexEfforts.includes(draft.codex.effort) ? draft.codex.effort : agent.codexEfforts[0]} onChange={(event) => agent.setCodexEffort(event.target.value as AgentReasoningEffort)}>{agent.codexEfforts.map((entry) => <option key={entry} value={entry}>{reasoningLabels[entry]}</option>)}</SelectInput></label>
      {!agent.codexRuntime.available && <p className="ai-config-warning">{agent.codexRuntime.reason || "本机没有可用的 Codex。"}</p>}
    </div> : <div className="ai-config-fields ai-config-fields--third-party">
      <label className="wide" htmlFor={`${id}-provider`}><span>模型厂商</span><SelectInput id={`${id}-provider`} value={agent.selectedProvider.id} onChange={(event) => agent.selectProvider(event.target.value)}>{agent.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName} · {provider.description}</option>)}</SelectInput></label>
      <section className="wide ai-model-bundle" aria-labelledby={`${id}-model-bundle-label`}>
        <header><span id={`${id}-model-bundle-label`}>模型与思考</span><span className="agent-config-help" tabIndex={0} aria-label="模型不同，可选的思考深度也不同" title="模型不同，可选的思考深度也不同"><Icon name="info" size={13} /></span></header>
        <div>
          <label htmlFor={`${id}-model`}><span>模型</span><SelectInput id={`${id}-model`} value={agent.selectedThirdPartyModel.id} onChange={(event) => agent.selectThirdPartyModel(event.target.value)}>{agent.selectedProvider.models.map((model) => <option key={model.id} value={model.id}>{model.displayName}{model.description ? ` · ${model.description}` : ""}</option>)}</SelectInput></label>
          <label htmlFor={`${id}-third-party-effort`}><span>思考深度</span><SelectInput id={`${id}-third-party-effort`} value={agent.thirdPartyEfforts.includes(draft.thirdParty.effort) ? draft.thirdParty.effort : agent.selectedThirdPartyModel.defaultReasoningEffort} onChange={(event) => agent.setThirdPartyEffort(event.target.value as AgentReasoningEffort)}>{agent.thirdPartyEfforts.map((entry) => <option key={entry} value={entry}>{reasoningLabels[entry]}</option>)}</SelectInput></label>
        </div>
      </section>
      <div className="wide ai-key-field">
        <div className="agent-key-label"><span className="agent-key-name">{agent.selectedProvider.displayName} API Key</span><span data-state={agent.configuredApiKey ? "good" : "watch"}>{agent.apiKey ? "待保存" : agent.configuredApiKey ? "已保存" : "未配置"}</span><button type="button" onClick={() => setEditingKey(true)}>{agent.configuredApiKey ? "更换" : "添加"}</button>{agent.configuredApiKey && <button type="button" onClick={() => { agent.removeApiKey(); setEditingKey(false); }}>移除</button>}</div>
        {editingKey && <div className="agent-key-editor"><label htmlFor={`${id}-api-key`} className="sr-only">{agent.selectedProvider.displayName} API Key</label><TextInput id={`${id}-api-key`} name={`${id}-api-key`} type="password" autoComplete="new-password" value={agent.apiKey} onChange={(event) => agent.setApiKey(event.target.value)} placeholder={`粘贴 ${agent.selectedProvider.displayName} API Key`} /><button type="button" disabled={!agent.apiKey || agent.saving} onClick={() => { void agent.save().then(() => setEditingKey(false)).catch(() => undefined); }}>{agent.saving ? "保存中…" : "保存密钥"}</button><button type="button" onClick={() => { agent.setApiKey(""); setEditingKey(false); }}>取消</button></div>}
        {editingKey && <p className="preferences-key-note">密钥只保存在本机</p>}
      </div>
    </div>}

    <p className="ai-config-save-state" role="status">{agent.loading ? "正在读取设置…" : agent.saving ? "正在保存…" : agent.error ? <><span>保存失败</span><button type="button" onClick={() => void agent.save().catch(() => undefined)}>重试</button></> : agent.apiKey ? "密钥输入完成后点击保存密钥" : agent.dirty ? "更改将自动保存" : agent.saved ? "已保存，所有对话生效" : ""}</p>
    {(agent.error || agent.loadError) && <p className="ai-config-error" role="alert">{agent.error || agent.loadError}</p>}
    </div>
  </fieldset>;
}

function effortsOf(model: AgentModelOption): AgentReasoningEffort[] {
  return model.supportedReasoningEfforts.length ? model.supportedReasoningEfforts : ["off"];
}
