import { useDismissLayer } from "../shared/use-dismiss-layer";
import { useRememberedWindow } from "../shared/use-remembered-preview";
import { FloatingAgentPanel } from "../features/desktop/FloatingAgentPanel";
import { ConversationWindow } from "../features/desktop/ConversationWindow";
import { useDesktopNotifications } from "../features/desktop/use-desktop-notifications";
import { CommandPalette } from "../features/desktop/CommandPalette";
import { Preferences } from "../features/desktop/Preferences";
import { Privacy } from "../features/desktop/Privacy";
import { ModelOnboarding } from "../features/desktop/ModelOnboarding";
import { QuickCapture } from "../features/desktop/QuickCapture";
import { useInspector } from "../features/desktop/InspectorContext";
import { AgentDock } from "../features/collaboration/Collaboration";
import { openDesktopWindow, type DesktopCommand } from "../features/desktop/bridge";
import { Predictions } from "../features/predictions/Predictions";
import React, { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import type { VaultInfo } from "@the-way-here/shared";
import { api } from "../api";
import { useApi } from "../shared/use-api";
import { navigation } from "./config";
import { activeKnowledgeChild, isSourceDocument, pageIdFromPathname, type LoadedReader } from "./navigation-state";
import { ReaderLocationProvider } from "../features/knowledge/reader-location";
import { type ReturnContext } from "../shared/routing";
import { shortcutSuppressed } from "./shortcut-guards";
import { ConfirmDeleteDialog } from "../shared/ConfirmDeleteDialog";
import { TruncatedTextTooltip } from "../shared/TruncatedTextTooltip";
import { Icon } from "../shared/ui";
import { OrganizedSources } from "../features/sources/Sources";
import { FocusWorkspace } from "../features/overview/FocusWorkspace";
import { GrowthHub } from "../features/overview/GrowthHub";
import { KnowledgeHome } from "../features/overview/KnowledgeHome";
import { QuestionsHub } from "../features/overview/QuestionsHub";
import { Today } from "../features/overview/Today";
import { Cards } from "../features/knowledge/Cards";
import { Letters } from "../features/knowledge/Letters";
import { MentalModels } from "../features/knowledge/MentalModels";
import { Reader } from "../features/knowledge/Reader";
import { Relationships } from "../features/knowledge/Relationships";
import { SearchResults } from "../features/knowledge/SearchResults";
import { Timeline } from "../features/knowledge/Timeline";
import { CreateKnowledgeBaseDialog, DemoKnowledgeBaseNotice } from "../features/knowledge-bases/KnowledgeBaseOnboarding";
import { ActiveLibraryProvider, demoLibraryLabel, tr, useI18n } from "../shared/i18n";

type KnowledgeBaseSummary = VaultInfo["knowledgeBases"][number];

function GlobalKnowledgeBaseSwitcher({ vault, disabled, onChange, onCreate, onDelete }: { vault: VaultInfo; disabled: boolean; onChange: (knowledgeBaseId: string) => void; onCreate: () => void; onDelete: (knowledgeBase: KnowledgeBaseSummary) => void }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissLayer(open, () => { setOpen(false); rootRef.current?.querySelector<HTMLButtonElement>(".global-kb-trigger")?.focus(); });
  const active = vault.knowledgeBases.find((knowledgeBase) => knowledgeBase.id === vault.knowledgeBaseId) || vault.knowledgeBases[0];

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  function chooseKnowledgeBase(knowledgeBaseId: string) {
    setOpen(false);
    onChange(knowledgeBaseId);
  }

  return <div className="global-kb-switcher" ref={rootRef}>
    <button className="global-kb-trigger" type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls="global-kb-menu" onClick={() => setOpen((current) => !current)}>
      <Icon name="spark" size={15} />
      <span>{active ? demoLibraryLabel(active.id, locale, active.name) : t("个人空间")}</span>
      <Icon name="down" size={14} />
    </button>
    {open ? <div className="global-kb-menu" id="global-kb-menu" role="menu" aria-label={t("切换知识库")}>
      <div className="global-kb-menu-heading"><b>{t("切换知识库")}</b><span>{t("每个空间有各自的记录、理解和对话。")}</span></div>
      <div className="global-kb-options">
        {vault.knowledgeBases.map((knowledgeBase) => {
          const selected = knowledgeBase.id === vault.knowledgeBaseId;
          const demo = knowledgeBase.id.toLowerCase() === "demo";
          const libraryName = demoLibraryLabel(knowledgeBase.id, locale, knowledgeBase.name);
          return <div className="global-kb-option-row" key={knowledgeBase.id}>
            <button className="global-kb-option-main" type="button" role="menuitemradio" aria-checked={selected} onClick={() => chooseKnowledgeBase(knowledgeBase.id)}>
              <span className="global-kb-check">{selected ? <Icon name="check" size={15} /> : null}</span>
              <span className="global-kb-option-copy"><span>{demoLibraryLabel(knowledgeBase.id, locale, knowledgeBase.name)}{demo ? <small>{t("演示")}</small> : null}</span><small>{demo ? t("预置的示例记忆，可以先感受被记住的体验") : t("来自「${knowledgeBase.name}」的生活记录与已有理解", { "knowledgeBase.name": knowledgeBase.name })}</small></span>
            </button>
            {!demo && vault.knowledgeBases.length > 1 ? <button className="global-kb-delete" type="button" role="menuitem" onClick={() => { setOpen(false); onDelete(knowledgeBase); }} aria-label={t("删除知识库「${name}」", { name: libraryName })} title={t("删除知识库")}><Icon name="trash" size={15} /></button> : null}
          </div>;
        })}
      </div>
      <button className="global-kb-create" type="button" role="menuitem" onClick={() => { setOpen(false); onCreate(); }}>{t("新建一个知识库")} <Icon name="arrow" size={14} /></button>
    </div> : null}
  </div>;
}

export function AppShell({ revision }: { revision: number }) {
  const { t, locale } = useI18n();
  const { data: vault } = useApi<VaultInfo>("/api/vault", revision);
  const initialKnowledgeBase = useRef<string | undefined>(undefined);
  const explicitKnowledgeBaseNavigation = useRef(false);
  useEffect(() => {
    if (!vault) return;
    if (initialKnowledgeBase.current && initialKnowledgeBase.current !== vault.knowledgeBaseId) {
      if (explicitKnowledgeBaseNavigation.current) return;
      window.location.replace(location.pathname === "/capture" ? "/capture" : location.pathname === "/preferences" ? "/preferences" : "/");
    } else initialKnowledgeBase.current = vault.knowledgeBaseId;
  }, [vault?.knowledgeBaseId]);
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  useDesktopNotifications(location.pathname);
  const readerReturnContext = location.state as ReturnContext | null;
  const [readerLocation, setReaderLocation] = useState<LoadedReader>();
  const loadedReader = readerLocation?.pageId === pageIdFromPathname(location.pathname) ? readerLocation : undefined;
  const isSourceReader = isSourceDocument(location.pathname, loadedReader, readerReturnContext?.returnTo, location.search);
  const searchWindow = useRememberedWindow("command-palette");
  const [inspectorByMenu, setInspectorByMenu] = useState<Record<string, boolean>>({});
  const [suspendedInspectorMenu, setSuspendedInspectorMenu] = useState<string>();
  const agentToggleRef = useRef<HTMLButtonElement>(null);
  const [knowledgeExpanded, setKnowledgeExpanded] = useState(true);
  const inspector = useInspector()!;
  const utilityWindow = location.pathname === "/preferences" || location.pathname === "/capture";
  const localConversation = location.pathname.startsWith("/focus/") || location.pathname === "/conversation";
  const detached = new URLSearchParams(location.search).has("detached");
  const openCapture = () => window.desktop ? void openDesktopWindow("/capture", "capture") : navigate("/capture");
  const openPreferences = () => window.desktop ? void openDesktopWindow("/preferences", "settings") : navigate("/preferences");
  const [knowledgeBaseSwitching, setKnowledgeBaseSwitching] = useState(false);
  const [switchingKnowledgeBaseName, setSwitchingKnowledgeBaseName] = useState("");
  const [knowledgeBaseError, setKnowledgeBaseError] = useState("");
  const [createKnowledgeBaseOpen, setCreateKnowledgeBaseOpen] = useState(false);
  const [deleteKnowledgeBaseTarget, setDeleteKnowledgeBaseTarget] = useState<KnowledgeBaseSummary>();

  function mainItemActive(item: (typeof navigation)[number]): boolean {
    if (item.to === "/") return location.pathname === "/";
    if (location.pathname.startsWith("/page/")) {
      if (item.to === "/sources") return Boolean(isSourceReader);
      if (item.to === "/knowledge") return !isSourceReader;
    }
    return item.active.some((prefix) => location.pathname.startsWith(prefix));
  }

  function childItemActive(child: { readonly to: string; readonly active: readonly string[] }): boolean {
    return child.active.some((prefix) => location.pathname.startsWith(prefix)) || activeKnowledgeChild(location.pathname, readerReturnContext?.returnTo, loadedReader) === child.to;
  }

  const activeSection = navigation.find((item) => mainItemActive(item));
  const activeMenu = activeSection?.children.find(childItemActive)?.to || activeSection?.to || location.pathname;
  const inspectorOpen = Boolean(inspectorByMenu[activeMenu]) && suspendedInspectorMenu !== activeMenu;
  const toggleInspector = () => {
    if (suspendedInspectorMenu === activeMenu) { setSuspendedInspectorMenu(undefined); return; }
    setInspectorByMenu(previous => ({ ...previous, [activeMenu]: !previous[activeMenu] }));
  };
  useEffect(() => setSuspendedInspectorMenu(undefined), [activeMenu]);
  useEffect(() => {
    const show = () => { setSuspendedInspectorMenu(undefined); setInspectorByMenu(previous => ({ ...previous, [activeMenu]: true })); };
    const hide = () => setInspectorByMenu(previous => ({ ...previous, [activeMenu]: false }));
    window.addEventListener("show-inspector", show); window.addEventListener("hide-inspector", hide);
    return () => { window.removeEventListener("show-inspector", show); window.removeEventListener("hide-inspector", hide); };
  }, [activeMenu]);
  useEffect(() => {
    if (navigationType !== "POP") document.getElementById("main-content")?.scrollTo({ top: 0 });
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [location.pathname, navigationType]);

  async function switchKnowledgeBase(knowledgeBaseId: string) {
    if (!vault || knowledgeBaseId === vault.knowledgeBaseId || knowledgeBaseSwitching) return;
    const nextKnowledgeBase = vault.knowledgeBases.find((item) => item.id === knowledgeBaseId);
    setKnowledgeBaseSwitching(true);
    setSwitchingKnowledgeBaseName(nextKnowledgeBase?.name ? demoLibraryLabel(nextKnowledgeBase.id, locale, nextKnowledgeBase.name) : t("所选空间"));
    setKnowledgeBaseError("");
    explicitKnowledgeBaseNavigation.current = true;
    try {
      await api<{ ok: boolean; knowledgeBaseId: string }>("/api/vault/select", {
        method: "POST",
        body: JSON.stringify({ knowledgeBaseId }),
      });
      let destination = location.pathname;
      if (destination.startsWith("/page/")) destination = isSourceReader ? "/sources" : "/knowledge";
      else if (destination.startsWith("/focus/")) destination = "/questions";
      window.location.assign(destination);
    } catch (reason: any) {
      explicitKnowledgeBaseNavigation.current = false;
      setKnowledgeBaseSwitching(false);
      setKnowledgeBaseError(reason.message);
    }
  }

  async function createKnowledgeBase(name: string) {
    setKnowledgeBaseSwitching(true);
    setSwitchingKnowledgeBaseName(name);
    setKnowledgeBaseError("");
    explicitKnowledgeBaseNavigation.current = true;
    try {
      await api<{ id: string; name: string; knowledgeBaseId: string }>("/api/vault", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      window.location.assign("/");
    } catch (reason: any) {
      explicitKnowledgeBaseNavigation.current = false;
      setKnowledgeBaseSwitching(false);
      throw reason;
    }
  }

  async function deleteKnowledgeBase() {
    if (!deleteKnowledgeBaseTarget) return;
    explicitKnowledgeBaseNavigation.current = true;
    try {
      await api<{ id: string; name: string; fallbackId: string }>(`/api/vault/${encodeURIComponent(deleteKnowledgeBaseTarget.id)}`, { method: "DELETE" });
      window.location.assign("/");
    } catch (reason) {
      explicitKnowledgeBaseNavigation.current = false;
      throw reason;
    }
  }

  function closeDeleteKnowledgeBaseDialog() {
    setDeleteKnowledgeBaseTarget(undefined);
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(".global-kb-trigger")?.focus(), 0);
  }

  useEffect(() => {
    function command(value: DesktopCommand) {
      if (shortcutSuppressed(value, document.activeElement)) return;
      if (value === "search") searchWindow.show();
      else if (value === "inspector") { if(localConversation) document.querySelector(".context-agent-panel")?.scrollIntoView({block:"nearest"}); else toggleInspector(); }
      else if (value === "capture") openCapture();
      else if (value === "settings") openPreferences();
      else if (value === "import") navigate("/sources?import=true");
      else if (value === "predict-self") navigate("/predict-self");
      else if (value === "back") navigate(-1);
      else if (value === "forward") navigate(1);
      else if (value === "focus") {
        const params = new URLSearchParams({ detached:"true", title:inspector.context.title });
        const run = document.querySelector<HTMLElement>(".context-agent-panel")?.dataset.runId;
        if (run) params.set("run",run);
        if (inspector.context.pageId) params.set("pageId",inspector.context.pageId);
        void openDesktopWindow(`/conversation?${params}`, "focus");
      }
      else if (value === "detach") {
        const params = new URLSearchParams(location.search); params.set("detached", "true");
        void openDesktopWindow(`${location.pathname}?${params}`, "reader");
      } else if (value.startsWith("knowledge-base:")) {
        const item = vault?.knowledgeBases[Number(value.split(":")[1]) - 1];
        if (item) void switchKnowledgeBase(item.id);
      }
    }
    const prefs = () => openPreferences();
    window.addEventListener("open-preferences", prefs);
    const unsubscribe = window.desktop?.onCommand(command);
    const keyboard = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.isComposing) return;
      let action: DesktopCommand | undefined;
      if (event.key.toLowerCase() === "k") action = "search";
      if (event.key === ",") action = "settings";
      if (event.key.toLowerCase() === "n") action = "capture";
      if (event.key.toLowerCase() === "o") action = "import";
      if (event.altKey && event.key.toLowerCase() === "i") action = "inspector";
      if (event.key === "Enter") action = "detach";
      if (event.shiftKey && event.key.toLowerCase() === "f") action = "focus";
      if (/^[1-9]$/.test(event.key)) action = `knowledge-base:${Number(event.key)}`;
      if (!action) return;
      event.preventDefault();
      if (shortcutSuppressed(action, event.target)) return;
      command(action);
    };
    // Native accelerators are handled by the application menu, once per key press.
    if (!window.desktop) window.addEventListener("keydown", keyboard);
    return () => { unsubscribe?.(); window.removeEventListener("open-preferences", prefs); window.removeEventListener("keydown", keyboard); };
  }, [location.pathname, location.search, vault, inspector.context, inspectorOpen]);

  const personalKnowledgeBase = vault?.knowledgeBases.find((item) => item.id.toLowerCase() !== "demo");

  const sectionLabel = activeSection?.children.find(childItemActive)?.label || activeSection?.label || tr("阅读");
  const libraryName = vault ? demoLibraryLabel(vault.knowledgeBaseId, locale, vault.name) : "The Way Here";
  const windowTitle = utilityWindow
    ? (location.pathname === "/capture" ? t("随手记") : t("偏好设置"))
    : `${location.pathname === "/search" ? t("搜索") : t(sectionLabel)} · ${libraryName}`;
  useEffect(() => { document.title = windowTitle; }, [windowTitle]);
  return (
    <ReaderLocationProvider publish={setReaderLocation}><ActiveLibraryProvider id={vault?.knowledgeBaseId}><div className={`app-shell desktop-shell${utilityWindow ? " utility-window" : ""}${detached ? " detached-window" : ""}${inspectorOpen && !utilityWindow && !detached && !localConversation ? " inspector-visible" : ""}${localConversation ? " local-conversation-mode" : ""}${window.desktop ? " native-desktop" : ""}`}>
      <a className="skip-link" href="#main-content">{t("跳到主要内容")}</a>
      <header className="desktop-titlebar">
        <div className="desktop-window-space" aria-hidden="true" />
        <span className="desktop-window-title">{windowTitle}</span>
        {!utilityWindow ? <><button className="desktop-icon" aria-label={t("搜索与命令")} title={t("搜索与命令 ⌘K")} onClick={searchWindow.show}><Icon name="search" size={17} /></button>
        {!localConversation && !detached ? <button ref={agentToggleRef} className={`desktop-icon agent-toggle${inspectorOpen ? " selected" : ""}`} aria-label={inspectorOpen ? t("收起Agent对话") : t("打开Agent对话")} aria-expanded={inspectorOpen} onClick={toggleInspector}><Icon name="spark" size={17} /><span className="agent-toggle-tooltip" role="tooltip">{inspectorOpen ? t("收起Agent对话") : t("打开Agent对话")}</span></button> : null}</> : null}
      </header>
      <aside className="desktop-sidebar" aria-label={t("侧边栏")}>
        <div className="desktop-identity"><img className="desktop-app-mark" src="/brand/app-icon.svg?v=app-icon-5" width={28} height={28} alt="" aria-hidden="true" /><b>The Way Here</b></div>
        {vault ? <GlobalKnowledgeBaseSwitcher vault={vault} disabled={knowledgeBaseSwitching} onChange={(id) => void switchKnowledgeBase(id)} onCreate={() => setCreateKnowledgeBaseOpen(true)} onDelete={setDeleteKnowledgeBaseTarget} /> : null}
        <nav id="main-navigation" className="desktop-navigation" aria-label={t("主要导航")} onClickCapture={event => { if ((event.target as Element).closest("a")) { setSuspendedInspectorMenu(activeMenu); window.dispatchEvent(new Event("suspend-floating-windows")); } }}>
          {navigation.map((item) => <React.Fragment key={item.to}>
            <div className="desktop-nav-row"><NavLink to={item.to} end={item.to === "/"} className={mainItemActive(item) ? "active" : ""}><Icon name={item.icon} size={16} /><span>{t(item.label)}</span></NavLink>{item.children.length ? <button aria-label={knowledgeExpanded ? t("收起已有理解") : t("展开已有理解")} aria-expanded={knowledgeExpanded} onClick={() => setKnowledgeExpanded((value) => !value)}><Icon name="down" size={12} /></button> : null}</div>
            {item.children.length && knowledgeExpanded ? <div className="desktop-subnav">{item.children.map((child) => <NavLink key={child.to} to={child.to} className={childItemActive(child) ? "active" : ""}>{t(child.label)}</NavLink>)}</div> : null}
          </React.Fragment>)}
        </nav>
        <div className="desktop-sidebar-bottom"><button onClick={openPreferences}><Icon name="controls" size={16} />{t("偏好设置")}</button></div>
      </aside>
      <main className="main-area" id="main-content" tabIndex={-1}>
        {knowledgeBaseSwitching ? <div className="knowledge-base-transition" role="status" aria-live="polite"><span />{t("正在打开「${name}」…", { name: switchingKnowledgeBaseName })}</div> : null}
        {knowledgeBaseError ? <div className="knowledge-base-error" role="alert">{tr(knowledgeBaseError)}</div> : null}
        <div className="page-frame">
          {!utilityWindow && !detached ? <ModelOnboarding revision={revision} initialOpen={location.pathname === "/"} onOpenPreferences={openPreferences} /> : null}
          {!utilityWindow && vault?.knowledgeBaseId.toLowerCase() === "demo" ? <DemoKnowledgeBaseNotice
            hasPersonalKnowledgeBase={Boolean(personalKnowledgeBase)}
            onCreate={() => setCreateKnowledgeBaseOpen(true)}
            onOpenPersonal={() => personalKnowledgeBase && void switchKnowledgeBase(personalKnowledgeBase.id)}
          /> : null}
          <Routes>
            <Route path="/conversation" element={<ConversationWindow revision={revision} />} />
            <Route path="/preferences" element={<Preferences revision={revision} />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/capture" element={vault ? <QuickCapture key={vault.knowledgeBaseId} vault={vault} /> : <p role="status">{t("正在打开知识库…")}</p>} />
            <Route path="/" element={<Today revision={revision} />} />
            <Route path="/predict-self" element={vault ? <Predictions key={vault.knowledgeBaseId} knowledgeBaseId={vault.knowledgeBaseId} /> : <p role="status">{t("正在打开知识库…")}</p>} />
            <Route path="/questions" element={<QuestionsHub revision={revision} />} />
            <Route path="/sources" element={<OrganizedSources revision={revision} />} />
            <Route path="/sources/materials" element={<OrganizedSources revision={revision} />} />
            <Route path="/knowledge" element={<KnowledgeHome revision={revision} />} />
            <Route path="/focus/:signalId" element={<FocusWorkspace revision={revision} />} />
            <Route path="/insights" element={<GrowthHub revision={revision} />} />
            <Route path="/timeline" element={<Timeline revision={revision} />} />
            <Route path="/relationships" element={<Relationships revision={revision} />} />
            <Route path="/cards/personal-lines" element={<Cards revision={revision} category="personal-lines" />} />
            <Route path="/cards/cycles" element={<Cards revision={revision} category="cycles" />} />
            <Route path="/cards/systems" element={<Cards revision={revision} category="systems" />} />
            <Route path="/letters" element={<Letters revision={revision} />} />
            <Route path="/mental-models" element={<MentalModels revision={revision} />} />
            <Route path="/search" element={<SearchResults revision={revision} />} />
            <Route path="/page/*" element={<Reader revision={revision} />} />
            <Route path="/wiki" element={<Navigate to="/knowledge" replace />} />
            <Route path="/understanding" element={<Navigate to="/knowledge" replace />} />
            <Route path="/understanding/overview" element={<Navigate to="/knowledge" replace />} />
            <Route path="/understanding/self" element={<Navigate to="/insights" replace />} />
            <Route path="/understanding/life" element={<Navigate to="/timeline" replace />} />
            <Route path="/understanding/people" element={<Navigate to="/relationships" replace />} />
            <Route path="/understanding/ahead" element={<Navigate to="/predict-self" replace />} />
            <Route path="/settings" element={<Navigate to="/preferences" replace />} />
            <Route path="/models" element={<Navigate to="/preferences?tab=ai" replace />} />
            <Route path="/collaboration" element={<Navigate to="/conversation" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      {!utilityWindow && !detached && !localConversation ? <FloatingAgentPanel open={inspectorOpen} triggerRef={agentToggleRef}><AgentDock revision={revision} context={inspector.context} /></FloatingAgentPanel> : null}
      {searchWindow.open ? <CommandPalette routes={navigation.flatMap(item => [{ title: item.label, to: item.to }, ...item.children.map(child => ({ title: child.label, to: child.to }))])} onClose={searchWindow.hide} onCapture={openCapture} onSettings={openPreferences} /> : null}
      {createKnowledgeBaseOpen ? <CreateKnowledgeBaseDialog onClose={() => setCreateKnowledgeBaseOpen(false)} onSubmit={createKnowledgeBase} /> : null}
      {deleteKnowledgeBaseTarget ? <ConfirmDeleteDialog
        title={t("删除这个知识库？")}
        description={t("其中的生活记录和已有理解会从本机永久删除。")}
        itemName={demoLibraryLabel(deleteKnowledgeBaseTarget.id, locale, deleteKnowledgeBaseTarget.name)}
        impact={deleteKnowledgeBaseTarget.id === vault?.knowledgeBaseId ? t("这是当前打开的知识库。删除后会自动打开另一个保留的空间；此操作不能撤销。") : t("这个知识库的日记、导入材料和构建出的理解都会一起删除；此操作不能撤销。")}
        confirmLabel={t("删除知识库")}
        onClose={closeDeleteKnowledgeBaseDialog}
        onConfirm={deleteKnowledgeBase}
      /> : null}
      <TruncatedTextTooltip />
    </div></ActiveLibraryProvider></ReaderLocationProvider>
  );
}
