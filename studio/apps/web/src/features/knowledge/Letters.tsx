import { FileMenu } from "../../shared/FileMenu";
import { SegmentedTabs } from "../../shared/SegmentedTabs";
import { LetterHistory } from "./LetterHistory";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { LettersView, ReasoningLens, WikiRun } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { letterRunVersions, openContextAgent } from "../collaboration/model";
import { FileBrowserPane, FileBrowserItem } from "../../shared/FileBrowser";
import { DocumentPreview } from "../../shared/DocumentPreview";
import { PageLink } from "../../shared/routing";
import { Empty, Icon, Loading } from "../../shared/ui";
import { TimelineFilter } from "../../shared/TimelineFilter";
import { LetterLensPicker } from "./LetterLensPicker";

export function Letters({ revision }: { revision: number }) {
  const { data, loading, error } = useApi<LettersView>("/api/views/letters", revision);
  const { data: lenses, error: lensesError } = useApi<ReasoningLens[]>("/api/lenses", revision);
  const { data: runList, loading: runsLoading, error: runsError } = useApi<WikiRun[]>("/api/runs", revision);
  const [params, setParams] = useSearchParams();
  const [year, setYear] = useState("全部");
  const [view, setView] = useState<"chronology" | "themes">("chronology");
  const [thread, setThread] = useState("全部");
  const [indexOpen, setIndexOpen] = useState(true);
  if (loading || runsLoading) return <Loading label="正在整理回信" />;
  if (error || !data) return <Empty>{error || "回信暂时无法读取，请刷新重试。"}</Empty>;
  const selectedThread = data.threads.find((item) => item.id === thread);
  const filtered = data.letters.filter((letter) => (view === "chronology" ? year === "全部" || letter.letterDate.startsWith(year) : thread === "全部" || selectedThread?.letters.includes(letter.page.id))).sort((a, b) => b.letterDate.localeCompare(a.letterDate));
  const selected = filtered.find((letter) => letter.page.id === params.get("letter")) || filtered[0];
  const generatedVersions = selected ? letterRunVersions(runList || [], selected.page.id) : [];
  const versions = selected ? [{ id: "original", label: "原始回信", lensName: "", markdown: "", createdAt: selected.letterDate, runId: "" }, ...generatedVersions] : [];
  const latestVersion = versions.at(-1);
  const activeVersion = versions.find((version) => version.id === params.get("version")) || latestVersion;
  const perspectiveVersions = [...new Map(generatedVersions.map(version => [version.lensName, version])).values()];
  const activePerspective = activeVersion?.id === "original" ? "original" : activeVersion?.lensName;
  const historical = Boolean(activeVersion && latestVersion && activeVersion.id !== latestVersion.id);
  const selectLetter = (id?: string, replace = false) => { setParams((current) => { const next = new URLSearchParams(current); if (id) next.set("letter", id); else next.delete("letter"); next.delete("version"); return next; }, { replace }); };
  const selectVersion = (id?: string) => { setParams((current) => { const next = new URLSearchParams(current); if (!id || id === latestVersion?.id) next.delete("version"); else next.set("version", id); return next; }, { replace: true }); };
  return (
    <div className="understanding-life-page understanding-letters-page organized-sources-page">
      <header className="letters-page-head"><div><h1>近况回信</h1><p>从过去的记录回望此刻，让当时的经历与现在重新发生联系。</p></div><div className="letters-page-count"><b>{data.letters.length}</b>封回信</div></header>
      <TimelineFilter
        label={view === "chronology" ? "按写信年份筛选" : "按回信主题筛选"}
        allLabel={view === "chronology" ? "全部年份" : "全部主题"}
        value={(view === "chronology" ? year : thread) === "全部" ? "" : view === "chronology" ? year : thread}
        total={data.letters.length}
        periods={view === "chronology" ? [...data.years].sort().reverse().map((item) => ({ value: item, label: `${item} 年`, count: data.letters.filter((letter) => letter.letterDate.startsWith(item)).length })) : data.threads.map((item) => ({ value: item.id, label: item.title, count: item.letters.length }))}
        onChange={(value) => { if (view === "chronology") setYear(value || "全部"); else setThread(value || "全部"); selectLetter(undefined, true); }}
        hint="按写信时间从新到旧排列"
        leading={<div className="letters-view-switch" role="group" aria-label="回信阅读方式"><button type="button" aria-pressed={view === "chronology"} onClick={() => { setView("chronology"); selectLetter(undefined, true); }}>按时间阅读</button><button type="button" aria-pressed={view === "themes"} onClick={() => { setView("themes"); selectLetter(undefined, true); }}>沿主题追踪</button></div>}
      />
      {(runsError || lensesError) && <p className="letters-load-warning" role="status">{runsError ? "历史版本暂时无法读取，当前显示原始回信。" : "重读视角暂时无法读取。"} 请刷新重试。</p>}
      <div className={`source-vault file-browser-documents${indexOpen ? "" : " file-pane-collapsed"}`} aria-label="近况回信工作区">
        <FileBrowserPane label="回信列表" count={`${filtered.length} 封`} open={indexOpen} onToggle={() => setIndexOpen(value => !value)} order="按写信时间从新到旧" toggleLabel="回信列表">
          {filtered.map(letter => <FileBrowserItem key={letter.page.id} title={letter.page.title.replace(/^\d{4}-\d{2}-\d{2}\s*/, "")} date={letter.letterDate.slice(0, 10)} dateLabel={letter.letterDate.slice(0, 10).replaceAll("-", ".")} excerpt={letter.page.excerpt} active={selected?.page.id === letter.page.id} onSelect={() => selectLetter(letter.page.id)} actions={<FileMenu page={letter.page} onRenamed={page => selectLetter(page.id, true)} onDeleted={() => selectLetter(undefined, true)} />} />)}
        </FileBrowserPane>
        {selected ? <DocumentPreview key={`${selected.page.id}:${activeVersion?.id}`} pageId={selected.page.id} revision={revision} showMetadata={false} onRenamed={page => selectLetter(page.id, true)}
          snapshot={activeVersion && activeVersion.id !== "original" ? { id: `letter-version-${activeVersion.id}`, markdown: activeVersion.markdown } : undefined}
          headerActions={<div className="letter-version-actions">
            {generatedVersions.length > 0 && <LetterHistory key={selected.page.id} versions={versions} activeId={activeVersion?.id} onSelect={selectVersion} />}
            <LetterLensPicker key={selected.page.id} lenses={lenses || []} onSelect={(lens) => { selectVersion(); openContextAgent({ mode: "read", outputTarget: { kind: "letter-version", pageId: selected.page.id, lensId: lens.id, lensName: lens.displayName, label: `${lens.displayName}视角回信` }, prompt: `请用「${lens.displayName}」的思考方式，重新写一版完整的近况回信《${selected.page.title}》，并重读它所依据的材料。这个视角特别关注：${lens.attention}。保持一位了解我来路的朋友口吻，只依据知识库里的原始材料和已有判断，不虚构事实、不模仿人物口头禅，也不要替我下结论。最终只输出可直接阅读的完整回信正文，并在末尾用“依据”列出引用的材料；不要修改任何文件，系统会把回答保留为「${lens.displayName}视角回信」。` }); }} />
          </div>}
          controls={<><div className="letter-provenance" aria-label="这封信的来历">
          <span>写于 <time dateTime={selected.letterDate.slice(0, 10)}>{selected.letterDate.slice(0, 10)}</time></span>
          {selected.evidenceFrom && <span>依据 {selected.evidenceFrom}{selected.evidenceTo && selected.evidenceTo !== selected.evidenceFrom ? ` 至 ${selected.evidenceTo}` : ""} 的材料</span>}
          <div className="letter-meta-themes">{selected.themes.slice(0, 2).map((theme) => <PageLink key={theme.id} page={theme}>{theme.title}</PageLink>)}{selected.themes.length > 2 && <details key={selected.page.id} className="letter-more-themes"><summary aria-label={`另外 ${selected.themes.length - 2} 个主题`}>+{selected.themes.length - 2}</summary><div>{selected.themes.slice(2).map((theme) => <PageLink key={theme.id} page={theme}>{theme.title}</PageLink>)}</div></details>}</div>
        </div>
        {perspectiveVersions.length > 0 && <div className="letter-version-bar">
          {perspectiveVersions.length > 0 && <SegmentedTabs className="letter-perspective-tabs" label="切换回信视角" value={activePerspective || "original"} options={perspectiveVersions.map(version => ({ value: version.lensName, label: `${version.lensName}视角回信` }))} onChange={value => selectVersion(value === "original" ? "original" : perspectiveVersions.find(version => version.lensName === value)?.id)} />}

        </div>}
        {historical && <div className="letter-history-banner" role="status">你正在查看历史版本 <button type="button" onClick={() => selectVersion()}>回到最新版本</button></div>}
</>}
          footer={activeVersion && activeVersion.id !== "original" ? <button className="letter-generation-link" type="button" onClick={() => openContextAgent({ runId: activeVersion.runId })}>查看生成对话 <Icon name="arrow" size={14} /></button> : undefined}
        /> : <div className="source-preview-empty"><Empty>当前范围暂无回信，可以切换筛选查看。</Empty></div>}
      </div>
      <PageAgentContext context={{ scope: view === "themes" ? `近况回信 · ${selectedThread?.title || "全部主题"}` : `近况回信 · ${year}`, title: selected?.page.title || `${year === "全部" ? "最近" : year + " 年"}的近况回信`, pageId: selected?.page.id, summary: selected?.page.excerpt || "从选定年份的日记和已有知识生成回信。", defaultMode: "write", suggestions: [year === "全部" ? "从 2025 年日记中抽样几篇，结合已有知识写一封新的近况回信。" : `从 ${year} 年日记中抽样几篇，结合已有知识写一封新的近况回信。`, selected ? "根据更多原始证据重新写这封回信，保留朋友式回应，不做绩效复盘。" : "请先帮我选择最值得回看的一个时间切片，再写回信。"] }} />
    </div>
  );
}
