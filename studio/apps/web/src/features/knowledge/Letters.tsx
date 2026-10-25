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
import { useI18n, currentLocale, translate } from "../../shared/i18n";

function tr(message: string, params?: Record<string, string | number | null | undefined>): string {
  return translate(currentLocale(), message, params);
}

const REQUEST_LABEL = "主动写一封 · ";

export function letterRequestContext(request: LetterRequest): AgentContext {
  return {
    scope: tr("近况回信 · 主动写信"),
    title: request.stage?.title || tr("主动写信"),
    pageId: request.stage?.pageId,
    summary: request.stage?.summary || tr("以这次指定的经历为起点，核对相关页面和原始材料。"),
    suggestions: [],
  };
}

function stageIntent(request: LetterRequest): string {
  const page = request.stage!.pageId ? tr("页面 ${request.stage!.pageId}", { "request.stage!.pageId": request.stage!.pageId }) : "";
  const detail = [request.stage!.range, page].filter(Boolean).join(currentLocale() === "en" ? ", " : "，");
  const wrapped = detail ? (currentLocale() === "en" ? ` (${detail})` : `（${detail}）`) : "";
  return currentLocale() === "en" ? `Experience: ${request.stage!.title}${wrapped}` : tr("经历：${p0}${wrapped}", { "p0": request.stage!.title, "wrapped": wrapped });
}

function lensLine(lens: { name: string; attention?: string }): string {
  const note = lens.attention ? (currentLocale() === "en" ? ` (${lens.attention})` : `（${lens.attention}）`) : "";
  return currentLocale() === "en" ? `Lens: ${lens.name}${note}` : tr("视角：${lens.name}${note}", { "lens.name": lens.name, "note": note });
}

export function requestPrompt(request: LetterRequest): { prompt: string; label: string } {
  const related = request.stage?.related;
  const groups: Array<[string, WikiPageSummary[]]> = related ? [
    [tr("关联事件"), related.events],
    [tr("关联人物"), related.people],
    [tr("关联地点"), related.places],
    [tr("关联现实系统"), related.systems],
  ] : [];
  const startingPoints = groups.filter(([, pages]) => pages.length).map(([label, pages]) => `- ${label}：${pages.map(page => `${page.title} [${page.id}]`).join("；")}`).join("\n");
  const intent = request.description
    ? tr("经历：${request.description}\n经历或时间不明确时先澄清。", { "request.description": request.description })
    : stageIntent(request);
  return {
    label: request.stage?.title || request.description?.slice(0, 24) || tr("自由描述"),
    prompt: [
      tr("读取并执行 build-companion-reflection，为这段经历写一封近况回信，保存到当前知识库。"),
      intent,
      request.lens ? lensLine(request.lens) : "",
      request.focus ? tr("关注点：${request.focus}", { "request.focus": request.focus }) : "",
      startingPoints ? tr("检索起点（需追溯原始来源）：\n${startingPoints}", { "startingPoints": startingPoints }) : "",
    ].filter(Boolean).join("\n"),
  };
}

export function perspectiveLetterRequest(letter: LetterViewItem, lens: ReasoningLens): { prompt: string; context: AgentContext } {
  const sources = [...new Set([...(letter.evidenceSources || []), ...letter.page.sources].filter(source => source && source !== "wiki synthesis"))];
  const period = [letter.evidenceFrom, letter.evidenceTo].filter(Boolean).join(tr(" 至 ")) || letter.letterDate;
  const clues = [
    tr("材料时间：${period}", { "period": period }),
    sources.length ? tr("原始来源线索：${sources.join(\"；\")}", { "sources.join(\"；\")": sources.join("；") }) : tr("原始来源线索：请按材料时间和主题检索，无法定位到具体原始材料时停止。"),
    letter.themes.length ? tr("主题检索线索：${letter.themes.map(theme => theme.title).join(\"；\")}", { "letter.themes.map(theme => theme.title).join(\"；\")": letter.themes.map(theme => theme.title).join("；") }) : "",
  ].filter(Boolean).join("\n");
  return {
    context: { scope: tr("近况回信 · 独立人物视角"), title: tr("从原始材料写信"), summary: clues, suggestions: [] },
    prompt: tr("读取并执行 build-companion-reflection 的「独立人物视角版本」，用「${lens.displayName}」的视角从原始材料写一封近况回信。\n人物文件：${lens.relativePath}\n${clues}\n只返回回信正文和依据，由系统保存。", { "lens.displayName": lens.displayName, "lens.relativePath": lens.relativePath, "clues": clues }),
  };
}

export function Letters({ revision }: { revision: number }) {
  const { t } = useI18n();
  const { data, loading, error } = useApi<LettersView>("/api/views/letters", revision);
  const { data: lenses, error: lensesError } = useApi<ReasoningLens[]>("/api/lenses", revision);
  const { data: lifeMap } = useApi<LifeMapView>("/api/views/life-map", revision);
  const { data: runList, loading: runsLoading, error: runsError } = useApi<WikiRun[]>("/api/runs", revision);
  const [params, setParams] = useSearchParams();
  const [year, setYear] = useState("");
  const [view, setView] = useState<"chronology" | "themes">("chronology");
  const [thread, setThread] = useState("");
  const [indexOpen, setIndexOpen] = useState(true);
  if (loading || runsLoading) return <Loading label={t("正在整理回信")} />;
  if (error || !data) return <Empty>{error ? t(error) : t("回信暂时无法读取，请刷新重试。")}</Empty>;
  const selectedThread = data.threads.find((item) => item.id === thread);
  const filtered = data.letters.filter((letter) => (view === "chronology" ? year === "" || letter.letterDate.startsWith(year) : thread === "" || selectedThread?.letters.includes(letter.page.id))).sort((a, b) => b.letterDate.localeCompare(a.letterDate));
  const selected = filtered.find((letter) => letter.page.id === params.get("letter")) || filtered[0];
  const generatedVersions = selected ? letterRunVersions(runList || [], selected.page.id) : [];
  const versions = selected ? [{ id: "original", label: tr("原始回信"), lensName: "", markdown: "", createdAt: selected.letterDate, runId: "" }, ...generatedVersions] : [];
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
        value={view === "chronology" ? year : thread}
        total={data.letters.length}
        periods={view === "chronology" ? [...data.years].sort().reverse().map((item) => ({ value: item, label: tr("${item} 年", { "item": item }), count: data.letters.filter((letter) => letter.letterDate.startsWith(item)).length })) : data.threads.map((item) => ({ value: item.id, label: item.title, count: item.letters.length }))}
        onChange={(value) => { if (view === "chronology") setYear(value); else setThread(value); selectLetter(undefined, true); }}
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
            <LetterLensPicker key={selected.page.id} lenses={lenses || []} onSelect={(lens) => { const request = perspectiveLetterRequest(selected, lens); selectVersion(); openContextAgent({ mode: "read", contextOverride: request.context, outputTarget: { kind: "letter-version", pageId: selected.page.id, lensId: lens.id, lensName: lens.displayName, label: tr("${lens.displayName}视角回信", { "lens.displayName": lens.displayName }) }, prompt: request.prompt }); }} />
          </div>}
          controls={<><div className="letter-provenance" aria-label={t("这封信的来历")}>
          <span>{t("写于 ")}<time dateTime={selected.letterDate.slice(0, 10)}>{selected.letterDate.slice(0, 10)}</time></span>
          {selected.evidenceFrom && <span>{t("依据 … 的材料").replace("…", `${selected.evidenceFrom}${selected.evidenceTo && selected.evidenceTo !== selected.evidenceFrom ? tr(" 至 ${selected.evidenceTo}", { "selected.evidenceTo": selected.evidenceTo }) : ""}`)}</span>}
          <div className="letter-meta-themes">{selected.themes.slice(0, 2).map((theme) => <PageLink key={theme.id} page={theme}>{theme.title}</PageLink>)}{selected.themes.length > 2 && <details key={selected.page.id} className="letter-more-themes"><summary aria-label={tr("另外 ${selected.themes.length - 2} 个主题", { "selected.themes.length - 2": selected.themes.length - 2 })}>+{selected.themes.length - 2}</summary><div>{selected.themes.slice(2).map((theme) => <PageLink key={theme.id} page={theme}>{theme.title}</PageLink>)}</div></details>}</div>
        </div>
        {historical && <div className="letter-history-banner" role="status">{t("你正在查看历史版本")} <button type="button" onClick={() => selectVersion()}>{t("回到最新版本")}</button></div>}
</>}
          footer={activeVersion && activeVersion.id !== "original" ? <button className="letter-generation-link" type="button" onClick={() => openContextAgent({ runId: activeVersion.runId })}>{t("查看生成对话")} <Icon name="arrow" size={14} /></button> : undefined}
        /> : <div className="source-preview-empty"><Empty>{t("当前范围暂无回信，可以切换筛选查看。")}</Empty></div>}
      </div>
      <PageAgentContext context={{ scope: view === "themes" ? tr("近况回信 · ${selectedThread?.title || \"全部主题\"}", { "selectedThread?.title || \"全部主题\"": selectedThread?.title || "全部主题" }) : tr("近况回信 · ${year}", { "year": year || "全部" }), title: selected?.page.title || tr("${year === \"全部\" ? \"最近\" : year + \" 年\"}的近况回信", { "year === \"全部\" ? \"最近\" : year + \" 年\"": year ? year + " 年" : "最近" }), pageId: selected?.page.id, summary: selected?.page.excerpt || tr("从选定年份的日记和已有知识生成回信。"), defaultMode: "write", suggestions: [year ? tr("从 ${year} 年日记中抽样几篇，结合已有知识写一封新的近况回信。", { "year": year }) : tr("从 2025 年日记中抽样几篇，结合已有知识写一封新的近况回信。"), selected ? tr("根据更多原始证据重新写这封回信，保留朋友式回应，不做绩效复盘。") : tr("请先帮我选择最值得回看的一个时间切片，再写回信。")] }} />
    </div>
  );
}
