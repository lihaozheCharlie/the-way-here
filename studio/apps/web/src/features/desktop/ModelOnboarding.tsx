import { useEffect, useRef, useState } from "react";
import type { AgentGlobalSettings, AgentProviderPreset, AgentRuntimeDescriptor, UpdateAgentGlobalSettings } from "@the-way-here/shared";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { Icon } from "../../shared/ui";
import { useDismissLayer } from "../../shared/use-dismiss-layer";
import "./model-onboarding.css";

const dismissedKey = "the-way-here.model-onboarding.dismissed";
const confirmedKey = "the-way-here.model-onboarding.confirmed";
const providerLinks: Record<string, string> = {
  deepseek: "https://platform.deepseek.com/api_keys",
  zhipu: "https://open.bigmodel.cn/console",
  qwen: "https://bailian.console.aliyun.com/?tab=model#/api-key",
  kimi: "https://platform.kimi.com/console/api-keys",
  minimax: "https://platform.minimax.cn/console/access?tab=api-keys",
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://platform.claude.com/settings/keys",
};

export function ModelOnboarding({ revision, initialOpen, onOpenPreferences }: { revision: number; initialOpen: boolean; onOpenPreferences: () => void }) {
  const { data: settings } = useApi<AgentGlobalSettings>("/api/agent-settings", revision);
  const { data: runtimes } = useApi<AgentRuntimeDescriptor[]>("/api/agent-runtimes", revision);
  const { data: providers } = useApi<AgentProviderPreset[]>("/api/agent-provider-presets", revision);
  const codex = runtimes?.find(runtime => runtime.id === "codex");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"setup" | "leave">("setup");
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(dismissedKey) === "true");
  const [neverRemind, setNeverRemind] = useState(false);
  const [mode, setMode] = useState<"codex" | "api">("api");
  const [providerId, setProviderId] = useState("deepseek");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const ready = Boolean(settings && runtimes && providers);
  const configured = Boolean(settings?.thirdParty.apiKeyConfiguredProviders.length);

  useEffect(() => {
    if (!initialOpen || !ready || configured || localStorage.getItem(confirmedKey) === "true" || dismissed) return;
    setMode(codex?.available ? "codex" : "api");
    const timer = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [initialOpen, ready, configured, dismissed, codex?.available]);

  useEffect(() => {
    const show = () => {
      if (configured || dismissed || localStorage.getItem(confirmedKey) === "true") return;
      setMode(codex?.available ? "codex" : "api");
      setOpen(true);
    };
    window.addEventListener("model-configuration-required", show);
    return () => window.removeEventListener("model-configuration-required", show);
  }, [configured, dismissed, codex?.available]);

  useEffect(() => {
    if (providers?.length && !providers.some(provider => provider.id === providerId)) setProviderId(providers[0]!.id);
  }, [providers, providerId]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    return () => previousFocus.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) dialogRef.current?.querySelector<HTMLElement>("button, select, input")?.focus();
  }, [open, step]);

  const requestClose = () => {
    if (saving) return;
    setStep(current => current === "setup" ? "leave" : "setup");
  };

  const postpone = () => {
    if (neverRemind) {
      localStorage.setItem(dismissedKey, "true");
      setDismissed(true);
    }
    setKey("");
    setStep("setup");
    setOpen(false);
  };
  useDismissLayer(open, requestClose, { dismissible: !saving, priority: 3, element: dialogRef });

  const selectedProvider = providers?.find(provider => provider.id === providerId);
  const canSave = mode === "codex" ? Boolean(codex?.available) : Boolean(key.trim() && selectedProvider);

  async function confirm() {
    if (!settings || !canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      const model = selectedProvider?.models[0];
      const payload: UpdateAgentGlobalSettings = {
        runtimeId: mode === "codex" ? "codex" : "pi",
        codex: settings.codex,
        thirdParty: mode === "api" && selectedProvider && model ? {
          providerId: selectedProvider.id,
          model: model.id,
          effort: model.defaultReasoningEffort,
          apiKey: key.trim(),
        } : {
          providerId: settings.thirdParty.providerId,
          model: settings.thirdParty.model,
          effort: settings.thirdParty.effort,
        },
      };
      await api("/api/agent-settings", { method: "PUT", body: JSON.stringify(payload) });
      localStorage.setItem(confirmedKey, "true");
      setKey("");
      setStep("setup");
      setOpen(false);
      window.dispatchEvent(new Event("agent-settings-updated"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  if (!ready || configured || localStorage.getItem(confirmedKey) === "true") return null;
  return <>
    {dismissed ? <div className="model-onboarding-strip" role="status"><Icon name="info" size={15} />尚未配置 AI 模型，部分功能不可用<button type="button" onClick={onOpenPreferences}>去配置</button></div> : null}
    {open ? <div className="model-onboarding-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <section ref={dialogRef} className={`model-onboarding-dialog${step === "leave" ? " is-leaving" : ""}`} role="dialog" aria-modal="true" aria-labelledby={step === "setup" ? "model-onboarding-title" : "model-onboarding-leave-title"} aria-describedby={step === "setup" ? "model-onboarding-description" : "model-onboarding-leave-description"} onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)") || [])];
        if (!controls.length) return;
        const first = controls[0]!;
        const last = controls.at(-1)!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        {step === "leave" ? <>
          <div className="model-onboarding-icon"><Icon name="info" size={24} /></div>
          <h2 id="model-onboarding-leave-title">稍后再配置 AI 模型？</h2>
          <p id="model-onboarding-leave-description" className="model-onboarding-warning"><Icon name="info" size={16} />暂不配置将无法理解你的经历、生成理解卡片，也无法对话。</p>
          <label className="model-onboarding-never-remind"><input type="checkbox" checked={neverRemind} onChange={event => setNeverRemind(event.target.checked)} />不再提醒我</label>
          <footer className="model-onboarding-leave-actions"><button className="model-onboarding-primary" type="button" onClick={() => setStep("setup")}>继续配置</button><button type="button" onClick={postpone}>稍后配置</button></footer>
        </> : <>
        <button className="model-onboarding-close" type="button" aria-label="关闭" disabled={saving} onClick={requestClose}>×</button>
        <div className="model-onboarding-icon"><Icon name="spark" size={24} /></div>
        <h2 id="model-onboarding-title">让 The Way Here 先认识你的思考方式</h2>
        <p id="model-onboarding-description">配置一次即可，之后可随时在「偏好设置 → AI 助手」更换。</p>
        {mode === "codex" ? <>
          <p className="model-onboarding-detection is-found"><Icon name="check" size={16} />检测到本机可用的 Codex</p>
          <div className="model-onboarding-choice"><span className="model-onboarding-radio" /><div><strong>使用本机 Codex <em>推荐 · 无需 API Key</em></strong><p>直接复用本机已登录的 Codex CLI，无需申请或粘贴密钥。</p></div></div>
          <button className="model-onboarding-switch" type="button" onClick={() => { setMode("api"); setError(""); }}>改用第三方模型 API Key →</button>
        </> : <>
          <div className="model-onboarding-choice"><span className="model-onboarding-radio" /><div><strong>使用第三方模型 API Key <em>推荐</em></strong><p>推荐 DeepSeek、智谱 GLM，也支持通义千问、Kimi、OpenAI 等厂商。</p><div className="model-onboarding-links">{["deepseek", "zhipu"].map(id => <a key={id} href={providerLinks[id]} target="_blank" rel="noopener noreferrer">申请{id === "deepseek" ? " DeepSeek" : "智谱 GLM"} Key ↗</a>)}</div></div></div>
          <label className="model-onboarding-field">模型厂商<select value={selectedProvider?.id || providerId} onChange={event => { setProviderId(event.target.value); setKey(""); }}>{providers?.map(provider => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>
          {selectedProvider && providerLinks[selectedProvider.id] && !["deepseek", "zhipu"].includes(selectedProvider.id) ? <a className="model-onboarding-provider-link" href={providerLinks[selectedProvider.id]} target="_blank" rel="noopener noreferrer">前往 {selectedProvider.displayName} 申请 API Key ↗</a> : null}
          <label className="model-onboarding-field">粘贴 API Key<input type="password" autoComplete="new-password" value={key} onChange={event => setKey(event.target.value)} placeholder="粘贴从厂商官网获取的 API Key" /></label>
          <p className="model-onboarding-hint">密钥保存在本机服务的配置文件中，提交后才会生效。</p>
          {codex?.available ? <button className="model-onboarding-switch" type="button" onClick={() => { setMode("codex"); setError(""); }}>改用本机 Codex →</button> : null}
        </>}
        {error ? <p className="model-onboarding-error" role="alert">{error}</p> : null}
        <footer><div><button type="button" disabled={saving} onClick={requestClose}>稍后配置</button><button className="model-onboarding-primary" type="button" disabled={!canSave || saving} onClick={() => void confirm()}>{saving ? "正在保存…" : mode === "codex" ? "确认使用 Codex" : "确认并开始使用"}</button></div></footer>
        </>}
      </section>
    </div> : null}
  </>;
}
