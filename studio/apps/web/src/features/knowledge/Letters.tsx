import { SelectInput } from "../../shared/form-controls";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { LettersView, ReasoningLens, WikiRun } from "@the-way-here/shared";
import { useApi } from "../../shared/use-api";
import { PageAgentContext } from "../desktop/InspectorContext";
import { letterRunVersions, openContextAgent, type LetterRunVersion } from "../collaboration/model";
import { ReadOnlyDocument } from "../../shared/markdown";
import { PageLink } from "../../shared/routing";
import { CollapsibleIndexPane, Empty, Icon, Loading } from "../../shared/ui";
import { TimelineFilter } from "../../shared/TimelineFilter";
import { LetterLensPicker } from "./LetterLensPicker";
import { EmbeddedPagePreview } from "./PagePreview";

function LetterVersionPreview({ pageTitle, version }: { pageTitle: string; version: LetterRunVersion }) {
  const markdown = /^#\s+.+$/m.test(version.markdown) ? version.markdown : `# ${pageTitle}\n\n${version.markdown}`;
  return <article className="embedded-page letter-version-preview" aria-live="polite">
    <ReadOnlyDocument id={`letter-version-${version.id}`} markdown={markdown} toolbar={
      <header className="letter-version-document-meta">
        <div><b>{version.label}</b><small>生成于 {new Date(version.createdAt).toLocaleString("zh-CN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></div>
        <button type="button" onClick={() => openContextAgent({ runId: version.runId })}>查看生成对话 <Icon name="arrow" size={14} /></button>
      </header>
    } />
  </article>;
}

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
  const selectLetter = (id?: string, replace = false) => { setParams((current) => { const next = new URLSearchParams(current); if (id) next.set("letter", id); else next.delete("letter"); next.delete("version"); return next; }, { replace }); };
  const selectVersion = (id?: string) => { setParams((current) => { const next = new URLSearchParams(current); if (!id || id === latestVersion?.id) next.delete("version"); else next.set("version", id); return next; }, { replace: true }); };
  return (
    <div className="understanding-life-page understanding-letters-page">
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
      <div className={`letter-explorer${indexOpen ? "" : " index-collapsed"}`}>
        <CollapsibleIndexPane open={indexOpen} onToggle={() => setIndexOpen((value) => !value)} label="回信列表">
          <aside className="letter-index" aria-label="回信列表">
            {filtered.map((letter) => <button type="button" aria-current={selected?.page.id === letter.page.id ? "true" : undefined} key={letter.page.id} className={selected?.page.id === letter.page.id ? "active" : ""} onClick={() => selectLetter(letter.page.id)}><time dateTime={letter.letterDate.slice(0, 10)}>{letter.letterDate.slice(0, 10)}</time><b>{letter.page.title.replace(/^\d{4}-\d{2}-\d{2}\s*/, "")}</b></button>)}
          </aside>
        </CollapsibleIndexPane>
        <div className="letter-detail">{selected ? <><section className="letter-meta-line" aria-label="这封信的来历">
          <span>写于 <time dateTime={selected.letterDate.slice(0, 10)}>{selected.letterDate.slice(0, 10)}</time></span>
          {selected.evidenceFrom && <span>依据 {selected.evidenceFrom}{selected.evidenceTo && selected.evidenceTo !== selected.evidenceFrom ? ` 至 ${selected.evidenceTo}` : ""} 的材料</span>}
          <div className="letter-meta-themes">{selected.themes.slice(0, 2).map((theme) => <PageLink key={theme.id} page={theme}>{theme.title}</PageLink>)}{selected.themes.length > 2 && <details key={selected.page.id} className="letter-more-themes"><summary aria-label={`另外 ${selected.themes.length - 2} 个主题`}>+{selected.themes.length - 2}</summary><div>{selected.themes.slice(2).map((theme) => <PageLink key={theme.id} page={theme}>{theme.title}</PageLink>)}</div></details>}</div>
          <div className="letter-meta-actions">
            {versions.length > 1 && activeVersion && <SelectInput aria-label="切换回信版本" value={activeVersion.id} onChange={(event) => selectVersion(event.target.value)}>{[...versions].reverse().map((version) => <option key={version.id} value={version.id}>{version.id === latestVersion?.id ? "最新 · " : "历史 · "}{version.label}{version.id === "original" ? " · 最初版本" : ` · ${new Date(version.createdAt).toLocaleDateString("zh-CN")}`}</option>)}</SelectInput>}
            <LetterLensPicker key={selected.page.id} lenses={lenses || []} onSelect={(lens) => { selectVersion(); openContextAgent({ mode: "read", outputTarget: { kind: "letter-version", pageId: selected.page.id, lensId: lens.id, lensName: lens.displayName, label: `${lens.displayName}视角回信` }, prompt: `请用「${lens.displayName}」的思考方式，重新写一版完整的近况回信《${selected.page.title}》，并重读它所依据的材料。这个视角特别关注：${lens.attention}。保持一位了解我来路的朋友口吻，只依据知识库里的原始材料和已有判断，不虚构事实、不模仿人物口头禅，也不要替我下结论。最终只输出可直接阅读的完整回信正文，并在末尾用“依据”列出引用的材料；不要修改任何文件，系统会把回答保留为「${lens.displayName}视角回信」。` }); }} />
          </div>
        </section>
        {activeVersion?.id !== "original" ? <LetterVersionPreview key={activeVersion?.id} pageTitle={selected.page.title} version={activeVersion as LetterRunVersion} /> : <EmbeddedPagePreview key={selected.page.id} page={selected.page} revision={revision} onRenamed={(renamed) => selectLetter(renamed.id, true)} />}</> : <Empty>当前范围暂无回信，可以切换筛选查看。</Empty>}</div>
      </div>
      <PageAgentContext context={{ scope: view === "themes" ? `近况回信 · ${selectedThread?.title || "全部主题"}` : `近况回信 · ${year}`, title: selected?.page.title || `${year === "全部" ? "最近" : year + " 年"}的近况回信`, pageId: selected?.page.id, summary: selected?.page.excerpt || "从选定年份的日记和已有知识生成回信。", defaultMode: "write", suggestions: [year === "全部" ? "从 2025 年日记中抽样几篇，结合已有知识写一封新的近况回信。" : `从 ${year} 年日记中抽样几篇，结合已有知识写一封新的近况回信。`, selected ? "根据更多原始证据重新写这封回信，保留朋友式回应，不做绩效复盘。" : "请先帮我选择最值得回看的一个时间切片，再写回信。"] }} />
    </div>
  );
}
