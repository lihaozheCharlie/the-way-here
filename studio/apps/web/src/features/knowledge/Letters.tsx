import { FileMenu } from "../../shared/FileMenu";
import { LetterHistory } from "./LetterHistory";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { LetterViewItem, LettersView, LifeMapView, ReasoningLens, WikiPageSummary, WikiRun } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { letterRunVersions, openContextAgent, type AgentContext } from "../collaboration/model";
import { FileBrowserPane, FileBrowserItem } from "../../shared/FileBrowser";
import { DocumentPreview } from "../../shared/DocumentPreview";
import { PageLink } from "../../shared/routing";
import { Empty, Icon, Loading } from "../../shared/ui";
import { TimelineFilter } from "../../shared/TimelineFilter";
import { LetterLensPicker } from "./LetterLensPicker";
import { LetterComposer, type LetterRequest } from "./LetterComposer";
import { useI18n } from "../../shared/i18n";

const REQUEST_LABEL = "主动写一封 · ";

export function letterRequestContext(request: LetterRequest): AgentContext {
  return {
    scope: "近况回信 · 主动写信",
    title: request.stage?.title || "主动写信",
    pageId: request.stage?.pageId,
    summary: request.stage?.summary || "以这次指定的经历为起点，核对相关页面和原始材料。",
    suggestions: [],
  };
}

export function requestPrompt(request: LetterRequest): { prompt: string; label: string } {
  const related = request.stage?.related;
  const groups: Array<[string, WikiPageSummary[]]> = related ? [
    ["关联事件", related.events],
    ["关联人物", related.people],
    ["关联地点", related.places],
    ["关联现实系统", related.systems],
  ] : [];
  const startingPoints = groups.filter(([, pages]) => pages.length).map(([label, pages]) => `- ${label}：${pages.map(page => `${page.title} [${page.id}]`).join("；")}`).join("\n");
  const intent = request.description
    ? `经历：${request.description}\n经历或时间不明确时先澄清。`
    : `经历：${request.stage!.title}${request.stage!.range || request.stage!.pageId ? `（${[request.stage!.range, request.stage!.pageId ? `页面 ${request.stage!.pageId}` : ""].filter(Boolean).join("，")}）` : ""}`;
  return {
    label: request.stage?.title || request.description?.slice(0, 24) || "自由描述",
    prompt: [
      "读取并执行 build-companion-reflection，为这段经历写一封近况回信，保存到当前知识库。",
      intent,
      request.lens ? `视角：${request.lens.name}${request.lens.attention ? `（${request.lens.attention}）` : ""}` : "",
      request.focus ? `关注点：${request.focus}` : "",
      startingPoints ? `检索起点（需追溯原始来源）：\n${startingPoints}` : "",
    ].filter(Boolean).join("\n"),
  };
}

export function perspectiveLetterRequest(letter: LetterViewItem, lens: ReasoningLens): { prompt: string; context: AgentContext } {
  const sources = [...new Set([...(letter.evidenceSources || []), ...letter.page.sources].filter(source => source && source !== "wiki synthesis"))];
  const period = [letter.evidenceFrom, letter.evidenceTo].filter(Boolean).join(" 至 ") || letter.letterDate;
  const clues = [
    `材料时间：${period}`,
    sources.length ? `原始来源线索：${sources.join("；")}` : "原始来源线索：请按材料时间和主题检索，无法定位到具体原始材料时停止。",
    letter.themes.length ? `主题检索线索：${letter.themes.map(theme => theme.title).join("；")}` : "",
  ].filter(Boolean).join("\n");
  return {
    context: { scope: "近况回信 · 独立人物视角", title: "从原始材料写信", summary: clues, suggestions: [] },
    prompt: `读取并执行 build-companion-reflection 的「独立人物视角版本」，用「${lens.displayName}」的视角从原始材料写一封近况回信。\n人物文件：${lens.relativePath}\n${clues}\n只返回回信正文和依据，由系统保存。`,
  };
}

export function Letters({ revision }: { revision: number }) {
  const { t } = useI18n();
  const { data, loading, error } = useApi<LettersView>("/api/views/letters", revision);
  const { data: lenses, error: lensesError } = useApi<ReasoningLens[]>("/api/lenses", revision);
  const { data: lifeMap } = useApi<LifeMapView>("/api/views/life-map", revision);
  const { data: runList, loading: runsLoading, error: runsError } = useApi<WikiRun[]>("/api/runs", revision);
  const [params, setParams] = useSearchParams();
  const [year, setYear] = useState("全部");
  const [view, setView] = useState<"chronology" | "themes">("chronology");
  const [thread, setThread] = useState("全部");
  const [indexOpen, setIndexOpen] = useState(true);
  if (loading || runsLoading) return <Loading label={t("正在整理回信")} />;
  if (error || !data) return <Empty>{error || t("回信暂时无法读取，请刷新重试。")}</Empty>;
  const selectedThread = data.threads.find((item) => item.id === thread);
  const filtered = data.letters.filter((letter) => (view === "chronology" ? year === "全部" || letter.letterDate.startsWith(year) : thread === "全部" || selectedThread?.letters.includes(letter.page.id))).sort((a, b) => b.letterDate.localeCompare(a.letterDate));
  const selected = filtered.find((letter) => letter.page.id === params.get("letter")) || filtered[0];
  const generatedVersions = selected ? letterRunVersions(runList || [], selected.page.id) : [];
  const versions = selected ? [{ id: "original", label: "原始回信", lensName: "", markdown: "", createdAt: selected.letterDate, runId: "" }, ...generatedVersions] : [];
  const latestVersion = versions.at(-1);
  const activeVersion = versions.find((version) => version.id === params.get("version")) || latestVersion;
  const historical = Boolean(activeVersion && latestVersion && activeVersion.id !== latestVersion.id);
  const requestedRuns = (runList || []).filter(run => run.sourceModule === "近况回信" && run.displayPrompt?.startsWith(REQUEST_LABEL));
  const pendingRequests = requestedRuns.filter(run => !["completed", "failed", "interrupted"].includes(run.status));
  const requestedPaths = new Set(requestedRuns.filter(run => run.status === "completed").flatMap(run => run.changes?.filter(change => change.kind !== "deleted" && change.path.endsWith(".md")).map(change => change.path.replaceAll("\\", "/")) || []));
  const handleRequest = (request: LetterRequest) => {
    const { prompt, label } = requestPrompt(request);
    openContextAgent({
      prompt,
      displayPrompt: `${REQUEST_LABEL}${label}`,
      mode: "write",
      lockMode: true,
      autoSubmit: true,
      contextOverride: letterRequestContext(request),
    });
  };
  const selectLetter = (id?: string, replace = false) => { setParams((current) => { const next = new URLSearchParams(current); if (id) next.set("letter", id); else next.delete("letter"); next.delete("version"); return next; }, { replace }); };
  const selectVersion = (id?: string) => { setParams((current) => { const next = new URLSearchParams(current); if (!id || id === latestVersion?.id) next.delete("version"); else next.set("version", id); return next; }, { replace: true }); };
  return (
    <div className="understanding-life-page understanding-letters-page organized-sources-page">
      <header className="letters-page-head"><div><h1>{t("近况回信")}</h1><p>{t("从过去的记录回望此刻，让当时的经历与现在重新发生联系。")}</p></div><div className="letters-page-actions"><LetterComposer stages={lifeMap?.stages || []} lenses={lenses || []} onSubmit={handleRequest} /><div className="letters-page-count"><b>{data.letters.length}</b>{t("封回信")}</div></div></header>
      <TimelineFilter
        label={view === "chronology" ? t("按写信年份筛选") : t("按回信主题筛选")}
        allLabel={view === "chronology" ? t("全部年份") : t("全部主题")}
        value={(view === "chronology" ? year : thread) === "全部" ? "" : view === "chronology" ? year : thread}
        total={data.letters.length}
        periods={view === "chronology" ? [...data.years].sort().reverse().map((item) => ({ value: item, label: `${item} 年`, count: data.letters.filter((letter) => letter.letterDate.startsWith(item)).length })) : data.threads.map((item) => ({ value: item.id, label: item.title, count: item.letters.length }))}
        onChange={(value) => { if (view === "chronology") setYear(value || "全部"); else setThread(value || "全部"); selectLetter(undefined, true); }}
        hint={t("按写信时间从新到旧排列")}
        leading={<div className="letters-view-switch" role="group" aria-label={t("回信阅读方式")}><button type="button" aria-pressed={view === "chronology"} onClick={() => { setView("chronology"); selectLetter(undefined, true); }}>{t("按时间阅读")}</button><button type="button" aria-pressed={view === "themes"} onClick={() => { setView("themes"); selectLetter(undefined, true); }}>{t("沿主题追踪")}</button></div>}
      />
      {(runsError || lensesError) && <p className="letters-load-warning" role="status">{runsError ? t("历史版本暂时无法读取，当前显示原始回信。") : t("重读视角暂时无法读取。")} {t("请刷新重试。")}</p>}
      <div className={`source-vault file-browser-documents${indexOpen ? "" : " file-pane-collapsed"}`} aria-label={t("近况回信工作区")}>
        <FileBrowserPane label={t("回信列表")} count={t("${count} 封", { count: filtered.length })} open={indexOpen} onToggle={() => setIndexOpen(value => !value)} toggleLabel={t("回信列表")}>
          {pendingRequests.map(run => <button key={run.id} type="button" className="letter-request-pending" onClick={() => openContextAgent({ runId: run.id })}><span className="letter-request-spinner" aria-hidden="true" /><b>{t("正在写信：${title}", { title: run.displayPrompt?.slice(REQUEST_LABEL.length) ?? "" })}</b><small>{t("查看写信进度")}</small></button>)}
          {filtered.map(letter => {
            const requested = [...requestedPaths].some(path => path.endsWith(letter.page.relativePath.replaceAll("\\", "/")) || path.endsWith(letter.page.id.replaceAll("\\", "/")));
            return <FileBrowserItem key={letter.page.id} page={letter.page} active={selected?.page.id === letter.page.id} onSelect={() => selectLetter(letter.page.id)} actions={<FileMenu page={letter.page} onRenamed={page => selectLetter(page.id, true)} onDeleted={() => selectLetter(undefined, true)} />}>{requested && <span className="letter-request-tag">{t("由你请求")}</span>}</FileBrowserItem>;
          })}
        </FileBrowserPane>
        {selected ? <DocumentPreview key={`${selected.page.id}:${activeVersion?.id}`} pageId={selected.page.id} revision={revision} showMetadata={false} onRenamed={page => selectLetter(page.id, true)}
          snapshot={activeVersion && activeVersion.id !== "original" ? { id: `letter-version-${activeVersion.id}`, markdown: activeVersion.markdown } : undefined}
          headerActions={<div className="letter-version-actions">
            {generatedVersions.length > 0 && <LetterHistory key={selected.page.id} versions={versions} activeId={activeVersion?.id} onSelect={selectVersion} />}
            <LetterLensPicker key={selected.page.id} lenses={lenses || []} onSelect={(lens) => { const request = perspectiveLetterRequest(selected, lens); selectVersion(); openContextAgent({ mode: "read", contextOverride: request.context, outputTarget: { kind: "letter-version", pageId: selected.page.id, lensId: lens.id, lensName: lens.displayName, label: `${lens.displayName}视角回信` }, prompt: request.prompt }); }} />
          </div>}
          controls={<><div className="letter-provenance" aria-label={t("这封信的来历")}>
          <span>写于 <time dateTime={selected.letterDate.slice(0, 10)}>{selected.letterDate.slice(0, 10)}</time></span>
          {selected.evidenceFrom && <span>依据 {selected.evidenceFrom}{selected.evidenceTo && selected.evidenceTo !== selected.evidenceFrom ? ` 至 ${selected.evidenceTo}` : ""} 的材料</span>}
          <div className="letter-meta-themes">{selected.themes.slice(0, 2).map((theme) => <PageLink key={theme.id} page={theme}>{theme.title}</PageLink>)}{selected.themes.length > 2 && <details key={selected.page.id} className="letter-more-themes"><summary aria-label={`另外 ${selected.themes.length - 2} 个主题`}>+{selected.themes.length - 2}</summary><div>{selected.themes.slice(2).map((theme) => <PageLink key={theme.id} page={theme}>{theme.title}</PageLink>)}</div></details>}</div>
        </div>
        {historical && <div className="letter-history-banner" role="status">你正在查看历史版本 <button type="button" onClick={() => selectVersion()}>{t("回到最新版本")}</button></div>}
</>}
          footer={activeVersion && activeVersion.id !== "original" ? <button className="letter-generation-link" type="button" onClick={() => openContextAgent({ runId: activeVersion.runId })}>{t("查看生成对话")} <Icon name="arrow" size={14} /></button> : undefined}
        /> : <div className="source-preview-empty"><Empty>{t("当前范围暂无回信，可以切换筛选查看。")}</Empty></div>}
      </div>
      <PageAgentContext context={{ scope: view === "themes" ? `近况回信 · ${selectedThread?.title || "全部主题"}` : `近况回信 · ${year}`, title: selected?.page.title || `${year === "全部" ? "最近" : year + " 年"}的近况回信`, pageId: selected?.page.id, summary: selected?.page.excerpt || "从选定年份的日记和已有知识生成回信。", defaultMode: "write", suggestions: [year === "全部" ? "从 2025 年日记中抽样几篇，结合已有知识写一封新的近况回信。" : `从 ${year} 年日记中抽样几篇，结合已有知识写一封新的近况回信。`, selected ? "根据更多原始证据重新写这封回信，保留朋友式回应，不做绩效复盘。" : "请先帮我选择最值得回看的一个时间切片，再写回信。"] }} />
    </div>
  );
}
