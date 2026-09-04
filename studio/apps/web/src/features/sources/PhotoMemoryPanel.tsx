import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PHOTO_MEMORY_QUESTION, photoAssetUrl, type PhotoMemory, type PhotoPerson, type RelationshipsView, type SourceImportBatch, type VaultInfo, type WikiRun } from "@the-way-here/shared";
import { api, useApi } from "../../api";
import { Icon } from "../../shared/ui";
import { openContextAgent } from "../collaboration/model";
import { clampPhotoBox } from "./photo-model";
import { parsePhotoDraft, photoDraftKey } from "./photo-draft";
import { detectPhotoBatch, detectionProgressLabel, type PhotoDetectionStatus } from "./photo-detection";
import { appendPhotoAnswer, pendingPhotoPersonEdits, photoPersonQueue, photoQuestions, type PhotoAnswer, type PhotoStep } from "./photo-flow";
import { detachFace, groupFaceFeatures, groupedPhotoQueue, type FaceGroups, type FaceFeature } from "./photo-face-groups";
import { PhotoProgress } from "./PhotoProgress";
import { PhotoPersonQueue, PhotoCrop } from "./PhotoPersonQueue";
import { PhotoNarration } from "./PhotoNarration";
import "./photo-memory.css";

// One task per stage; clues, named identities and confirmed narrative retain separate boundaries.
export function PhotoMemoryPanel({ batch, revision }: { batch: SourceImportBatch; revision: number }) {
  const { data: vault } = useApi<VaultInfo>("/api/vault");
  return vault ? <BoundPhotoMemory key={`${vault.knowledgeBaseId}:${batch.id}`} batch={batch} knowledgeBaseId={vault.knowledgeBaseId} revision={revision} /> : <p>正在打开照片记忆…</p>;
}

function BoundPhotoMemory({ batch, knowledgeBaseId, revision }: { batch: SourceImportBatch; knowledgeBaseId: string; revision: number }) {
  const draftKey = photoDraftKey(knowledgeBaseId, batch.id);
  const [initialDraft] = useState(() => { try { return parsePhotoDraft(localStorage.getItem(draftKey)); } catch { return undefined; } });
  const base = `/api/photo-memories/${encodeURIComponent(batch.id)}`;
  const { data, error: loadError } = useApi<PhotoMemory>(`${base}?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`, revision);
  const { data: relationships } = useApi<RelationshipsView>("/api/views/relationships", revision);
  const people = relationships?.groups.flatMap((group) => group.people) || [];
  const { data: runs = [] } = useApi<WikiRun[]>("/api/runs", revision);
  const [memory, setMemory] = useState<PhotoMemory>();
  const [step, setStep] = useState<PhotoStep>(2);
  const [selectedId, setSelectedId] = useState("");
  const [photoDrafts, setPhotoDrafts] = useState<Record<string, PhotoPerson[]>>({});
  const [faceGroups, setFaceGroups] = useState<FaceGroups>([]);
  const faceFeatures = useRef<FaceFeature[]>([]);
  const [groupingRevision, setGroupingRevision] = useState(0);
  const [story, setStory] = useState("");
  const [storyDirty, setStoryDirty] = useState(false);
  const [answers, setAnswers] = useState<PhotoAnswer[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [direct, setDirect] = useState(false);
  const [choiceMade, setChoiceMade] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detection, setDetection] = useState<Record<string, PhotoDetectionStatus>>({});
  const [detectionRunning, setDetectionRunning] = useState(false);
  const [detectionRetry, setDetectionRetry] = useState(0);
  const initialized = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const heading = panelRef.current?.querySelector<HTMLElement>(".photo-stage-heading h3");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    panelRef.current?.scrollIntoView({ block: "start" });
  }, [step]);
  const completedDetections = useRef(new Set<string>());
  const latestAnnotations = useRef({ memory, photoDrafts });
  latestAnnotations.current = { memory, photoDrafts };
  const photoIds = memory?.photos.map((photo) => photo.id).join(",") ?? "";
  useEffect(() => {
    if (!data) return;
    setMemory((current) => !current || data.revision >= current.revision ? data : current);
    if (!initialized.current) {
      initialized.current = true;
      // Resume before publishing the loaded memory so detection and autosave
      // never race with restoring the user's local work.
      if (initialDraft) {
        setPhotoDrafts(Object.fromEntries(Object.entries(initialDraft.photoDrafts ?? (initialDraft.peopleDirty ? { [initialDraft.photoId]: initialDraft.people } : {})).filter(([id]) => data.photos.some((photo) => photo.id === id))));
        if (initialDraft.storyDirty) { setStory(initialDraft.story); setStoryDirty(true); }
        setFaceGroups(initialDraft.faceGroups ?? []);
        setAnswers(initialDraft.answers ?? []); setSkipped(initialDraft.skipped ?? []); setAnswer(initialDraft.answer ?? "");
        setDirect(initialDraft.direct ?? false); setChoiceMade(initialDraft.choiceMade ?? false);
        setStep(initialDraft.step === 5 && (!data.confirmedAt || initialDraft.storyDirty) ? 4 : initialDraft.step ?? (data.confirmedAt ? 5 : data.draft ? 4 : 2));
      } else setStep(data.confirmedAt ? 5 : data.draft ? 4 : 2);
    }
  }, [data]);
  useEffect(() => {
    if (!memory || step !== 2) return;
    const controller = new AbortController();
    setDetectionRunning(true);
    void detectPhotoBatch(memory.photos.map((photo) => ({ id: photo.id, url: photoAssetUrl(knowledgeBaseId, batch.id, photo.id) })), {
      signal: controller.signal,
      shouldSkip: (id) => completedDetections.current.has(id) || Object.hasOwn(latestAnnotations.current.photoDrafts, id) || Boolean(latestAnnotations.current.memory?.photos.find((photo) => photo.id === id)?.people.length),
      onStatus: (id, status) => {
        if (status.state !== "detecting") completedDetections.current.add(id);
        setDetection((current) => ({ ...current, [id]: status }));
      },
      onDetected: (id, boxes, descriptors) => {
        const candidates = boxes.map((box) => ({ id: crypto.randomUUID(), name: "", useAsAvatar: true, box: clampPhotoBox(box) }));
        candidates.forEach((person, i) => { const descriptor = descriptors?.[i]; if (descriptor) faceFeatures.current.push({ id: person.id, photoId: id, descriptor }); });
        setPhotoDrafts((current) => Object.hasOwn(current, id) || !boxes.length ? current : { ...current, [id]: candidates });
      },
    }).then(() => { if (!controller.signal.aborted) { setDetectionRunning(false); setGroupingRevision((value) => value + 1); } });
    return () => { controller.abort(); setDetectionRunning(false); faceFeatures.current = []; };
  }, [photoIds, step, detectionRetry, knowledgeBaseId, batch.id]);
  useEffect(() => {
    if (!memory || !groupingRevision) return;
    const eligible = new Set(photoPersonQueue(memory, photoDrafts).filter((entry) => !entry.confirmed && !entry.person.name && !entry.person.pageId).map((entry) => entry.person.id));
    const groups = groupFaceFeatures(faceFeatures.current.filter((face) => eligible.has(face.id)));
    faceFeatures.current = [];
    if (groups.length) setFaceGroups((current) => [...current, ...groups]);
  }, [groupingRevision]);
  useEffect(() => { if (memory && !storyDirty) setStory(memory.draft || memory.confirmedStory); }, [memory?.revision, storyDirty]);
  const pendingPeople = memory ? pendingPhotoPersonEdits(memory, photoDrafts).length : 0;
  const anyDirty = pendingPeople > 0;
  const unsaved = anyDirty || storyDirty || Boolean(answer);
  const hasLocalDraft = Object.keys(photoDrafts).length > 0 || storyDirty || Boolean(answer);
  useEffect(() => {
    if (!memory) return;
    try {
      const photo = memory.photos[0]!;
      // Preserve progress and the answer currently being typed as well as the assembled story.
      if (hasLocalDraft || answers.length || skipped.length || choiceMade) localStorage.setItem(draftKey, JSON.stringify({ revision: memory.revision, photoId: photo.id, people: photoDrafts[photo.id] ?? photo.people, peopleDirty: Object.hasOwn(photoDrafts, photo.id), story, storyDirty, photoDrafts, faceGroups, step, answers, skipped, answer, direct, choiceMade }));
      else localStorage.removeItem(draftKey);
      setDraftSaved(hasLocalDraft);
    } catch { setDraftSaved(false); setError("本机暂时无法保存草稿。离开前请确认保存，或复制保留讲述。"); }
  }, [draftKey, memory?.revision, hasLocalDraft, story, storyDirty, photoDrafts, faceGroups, step, answers, skipped, answer, direct, choiceMade]);
  useEffect(() => {
    if (!hasLocalDraft || draftSaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasLocalDraft, draftSaved]);
  const related = runs.filter((run) => run.knowledgeBaseId === knowledgeBaseId && (run.outputTarget?.kind === "photo-memory" && run.outputTarget.importId === batch.id || run.sourceContext?.importId === batch.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = related.find((run) => !["completed", "failed", "interrupted"].includes(run.status));
  const latestDialogue = related.find((run) => run.outputTarget?.kind === "photo-memory" && run.outputTarget.phase === "enrich");
  const locked = Boolean(busy || active);
  const published = Boolean(memory?.builtAt && memory.confirmedAt && memory.builtAt >= memory.confirmedAt);
  const cleanPublished = published && !unsaved;

  async function save(payload: object): Promise<PhotoMemory | undefined> {
    if (!memory || locked) return;
    setBusy("保存中…"); setError(""); setNotice("");
    try {
      const saved = await api<PhotoMemory>(base, { method: "PATCH", body: JSON.stringify({ ...payload, knowledgeBaseId, revision: memory.revision }) });
      setMemory((current) => !current || saved.revision >= current.revision ? saved : current);
      return saved;
    } catch (reason: any) { setError(reason.message); } finally { setBusy(""); }
  }
  async function start(phase: "analyze" | "enrich" | "build") {
    if (!memory || locked) return;
    if (phase === "enrich" && (storyDirty || answer.trim())) {
      setError("还有本机讲述尚未确认。请先核对并确认，再继续 AI 对话，避免新草稿覆盖你的补充。"); return;
    }
    setError(""); setBusy("正在开始…");
    try {
      const isBuild = phase === "build";
      const run = await api<WikiRun>("/api/runs", { method: "POST", body: JSON.stringify({
        knowledgeBaseId, mode: isBuild ? "write" : "read", title: `${isBuild ? "构建" : phase === "analyze" ? "看一看" : "聊聊"} · ${memory.title}`,
        displayPrompt: isBuild ? "构建这段记忆" : phase === "analyze" ? "看看照片里的场景，找一些可以聊的线索" : `从“${PHOTO_MEMORY_QUESTION}”开始聊这批照片。`,
        prompt: isBuild ? `请按 build-wiki 的导入后冷启构建入口读取「${memory.reportPath}」。只摄取“用户确认的讲述”和用户明确指定的人物；保留来源不变，不猜测未命名者、关系或情绪。已选人物必须沿用页面关联；其余称呼可结合姓名、别名、上下文匹配已有档案，包括“我”和“自己”，无需二次询问。完成派生内容和质量门，并说明更新或跳过的内容。` : phase === "analyze" ? `请看这批照片，只整理可见线索。每张照片的回忆问题统一为“${PHOTO_MEMORY_QUESTION}”，不针对画面细节另拟问题，暂不写人生故事。` : `用“${PHOTO_MEMORY_QUESTION}”邀请我讲述每张照片，不围绕画面物件追问。一次只聊一张，允许跳过，不把照片表情当成真实心情。`,
        ...(!isBuild ? { outputTarget: { kind: "photo-memory", importId: batch.id, storedPath: memory.reportPath, label: memory.title, phase } } : { sourceContext: { importId: batch.id, storedPath: memory.reportPath, flow: "dialogue", operation: "build" } }),
      }) });
      if (phase === "analyze") setChoiceMade(true);
      openContextAgent({ runId: run.id });
    } catch (reason: any) { setError(reason.message); } finally { setBusy(""); }
  }
  function editPerson(photoId: string, personId: string, patch: Partial<PhotoPerson>) {
    if (!memory) return;
    const group = groupedPhotoQueue(memory, photoDrafts, faceGroups).find((entry) => entry.members.some((member) => member.person.id === personId));
    const members = group && ("name" in patch || "pageId" in patch) ? group.members : photoPersonQueue(memory, photoDrafts).filter((entry) => entry.photo.id === photoId && entry.person.id === personId);
    setPhotoDrafts((drafts) => {
      const next = { ...drafts };
      for (const entry of members) next[entry.photo.id] = (drafts[entry.photo.id] ?? entry.photo.people).map((person) => person.id === entry.person.id ? { ...person, ...patch } : person);
      return next;
    });
  }
  async function resolvePerson(photoId: string, person: PhotoPerson, skip: boolean) {
    if (!memory || locked) return;
    const queue = groupedPhotoQueue(memory, photoDrafts, faceGroups);
    const group = queue.find((entry) => entry.members.some((member) => member.photo.id === photoId && member.person.id === person.id));
    if (!group) return;
    const memberIds = new Set(group.members.map((entry) => entry.person.id));
    const updates = group.members.map((entry) => ({ photoId: entry.photo.id, people: [
      ...entry.photo.people.filter((item) => !memberIds.has(item.id)),
      ...(!skip ? [{ ...entry.person, name: person.name.trim(), pageId: person.pageId, useAsAvatar: true }] : []),
    ] }));
    const saved = skip && group.members.every((entry) => !entry.photo.people.some((item) => item.id === entry.person.id)) ? memory : await save({ photos: updates });
    if (!saved) return;
    group.members.forEach((entry) => completedDetections.current.add(entry.photo.id));
    setPhotoDrafts((drafts) => {
      const next = { ...drafts };
      for (const entry of group.members) {
        const all = drafts[entry.photo.id] ?? entry.photo.people;
        next[entry.photo.id] = all.flatMap((item) => item.id !== entry.person.id ? [item] : skip ? [] : [saved.photos.find((photo) => photo.id === entry.photo.id)!.people.find((item) => item.id === entry.person.id)!]);
        if (photoPersonQueue(saved, next).filter((item) => item.photo.id === entry.photo.id).every((item) => item.confirmed)) delete next[entry.photo.id];
      }
      return next;
    });
    if (skip) setFaceGroups((groups) => groups.filter((ids) => !ids.some((id) => memberIds.has(id))));
    setSelectedId(queue.find((entry) => !entry.confirmed && !memberIds.has(entry.person.id))?.person.id || "");
  }
  function separateFace(id: string) {
    if (locked) return;
    setFaceGroups((groups) => detachFace(groups, id));
    setSelectedId(id);
    setNotice("已移出这组，可以单独确认。");
  }
  function addAnswer(entry: PhotoAnswer) {
    const photoIndex = memory?.photos.findIndex((photo) => photo.id === entry.photoId) ?? -1;
    const photoLabel = photoIndex >= 0 ? `第 ${photoIndex + 1} 张照片（${memory!.photos[photoIndex]!.name}）` : entry.photoId;
    const next = appendPhotoAnswer(story, entry, photoLabel);
    if (next.length > 60000) { setError("讲述已接近 6 万字，请先精简整段故事再继续。"); return false; }
    setStory(next); setStoryDirty(true); setAnswers((current) => [...current, entry]); setAnswer(""); return true;
  }
  function includePendingAnswer() {
    const question = memory && photoQuestions(memory).find((item) => !answers.some((entry) => entry.photoId === item.photoId) && !skipped.includes(item.photoId));
    return !answer.trim() || !question || addAnswer({ ...question, answer });
  }
  function navigateStep(next: PhotoStep) {
    if (locked || next === step) return;
    // Navigation keeps unconfirmed people and carries an in-progress answer into review.
    if (step === 3 && !includePendingAnswer()) return;
    setStep(next); setEditingReview(false); setNotice("");
    if (next === 3 && story.trim()) setChoiceMade(true);
  }
  async function confirmStory() {
    if (await save({ story })) { setStoryDirty(false); setEditingReview(false); setStep(5); setNotice("这份讲述已经确认，可以构建了。"); }
  }
  function openDialogue() {
    if (storyDirty || answer.trim()) { setError("请先核对并确认本机讲述，再继续 AI 对话。"); return; }
    latestDialogue ? openContextAgent({ runId: latestDialogue.id }) : void start("enrich");
  }

  if (loadError) return <section className="photo-memory"><p role="alert">{loadError}</p></section>;
  if (!memory) return <section className="photo-memory"><p>正在打开这段记忆…</p></section>;
  const named = memory.photos.flatMap((photo) => photo.people.map((person) => ({ photo, person })));
  const names = [...new Set(named.map(({ person }) => person.name))];
  const allPeople = photoPersonQueue(memory, photoDrafts);
  const completedSteps: PhotoStep[] = [1, ...(allPeople.length && allPeople.every((person) => person.confirmed) && !detectionRunning ? [2 as const] : []), ...(story.trim() ? [3 as const] : []), ...(memory.confirmedAt && !unsaved ? [4 as const] : []), ...(cleanPublished ? [5 as const] : [])];
  return <section ref={panelRef} className="photo-memory" aria-label="照片记忆工作区">
    <header className="photo-memory-head"><div><h2>{memory.title}</h2><p>{memory.photos.length} 张照片 · 只把你确认的故事收进理解</p></div><span className={`photo-state${cleanPublished ? " is-built" : ""}`}>{active ? "正在整理" : unsaved ? "本机草稿 · 尚未确认" : cleanPublished ? "已收进理解" : memory.confirmedAt ? "讲述已确认" : "记忆草稿"}</span></header>
    <PhotoProgress step={step} completed={completedSteps} disabled={locked} onStep={navigateStep} />
    {active ? <p className="photo-feedback" role="status">正在处理「{active.title}」。可以离开，结果会保留。<button type="button" onClick={() => openContextAgent({ runId: active.id })}>查看进度</button></p> : related[0]?.status === "failed" ? <p className="photo-feedback" role="alert">{related[0].error || "上一步没有完成，可以重试或手动讲述。"}{related[0].outputTarget?.kind === "photo-memory" && related[0].outputTarget.phase === "analyze" ? <button type="button" disabled={locked} onClick={() => void start("analyze")}>重新看图</button> : null}</p> : null}
    {step === 1 ? <section><header className="photo-stage-heading"><h3>本次选择的照片</h3><p>{memory.photos.length} 张照片，点击可保存原图。</p></header><div className="photo-selected-gallery">{memory.photos.map((photo, index) => <a key={photo.id} href={photoAssetUrl(knowledgeBaseId, memory.id, photo.id, "original")} download={photo.name}><img src={photoAssetUrl(knowledgeBaseId, memory.id, photo.id)} alt={photo.name} /><span>第 {index + 1} 张 · {photo.name}</span></a>)}</div><footer className="photo-stage-footer"><button type="button" className="primary-action" disabled={locked} onClick={() => navigateStep(2)}>下一步：认人物<Icon name="arrow" size={14} /></button></footer></section> : null}
    {step === 2 ? <PhotoPersonQueue memory={memory} drafts={photoDrafts} groups={faceGroups} onDetach={separateFace} groupingError={Object.values(detection).find((status) => status.groupingError)?.groupingError} selectedId={selectedId} people={people} locked={locked} onSelect={setSelectedId} onChange={editPerson} onConfirm={(id, person) => void resolvePerson(id, person, false)} onSkip={(id, person) => void resolvePerson(id, person, true)} onContinue={() => navigateStep(3)} detecting={detectionRunning} detectionLabel={detectionProgressLabel(memory.photos, detection)} detectionError={Object.values(detection).find((status) => status.state === "failed")?.error} onRetry={() => { for (const [id, status] of Object.entries(detection)) if (status.state === "failed") completedDetections.current.delete(id); setDetectionRetry((value) => value + 1); }} /> : null}
    {step === 3 ? <>
      <PhotoNarration memory={memory} answers={answers} skipped={skipped} answer={answer} direct={direct} story={story} locked={locked} choiceMade={choiceMade} onChoice={() => setChoiceMade(true)} onAnswer={setAnswer} onSend={addAnswer} onSkip={(id) => { setSkipped((current) => [...current, id]); setAnswer(""); }} onDirect={(value) => { if (includePendingAnswer()) setDirect(value); }} onStory={(value) => { setStory(value); setStoryDirty(true); }} onReview={() => navigateStep(4)} onAnalyze={() => void start("analyze")} onDialogue={openDialogue} hasDialogue={Boolean(latestDialogue)} />
    </> : null}
    {step === 4 ? <section><header className="photo-stage-heading"><h3>核对一下，这就是要收进理解的讲述</h3><p>先读一遍，需要改动可以直接编辑，也可以回去继续讲。</p></header>
      <article className="photo-review"><header><h4>记忆报告草稿</h4><button type="button" className="photo-text-action" disabled={locked} onClick={() => setEditingReview(!editingReview)}>{editingReview ? "完成编辑" : "编辑"}</button></header>{editingReview ? <textarea aria-label="编辑记忆报告草稿" value={story} maxLength={60000} disabled={locked} rows={8} onChange={(event) => { setStory(event.target.value); setStoryDirty(true); }} /> : <p className="photo-review-text">{story || "还没有讲述，回去讲讲照片里的故事吧。"}</p>}<div className="photo-review-meta"><span><Icon name="image" size={15} />{memory.photos.length} 张照片</span><span>已指定人物：{names.join("、") || "暂无"}</span><span>{answers.length ? `${answers.length} 条逐条讲述 · 可含手写补充` : "来自记忆草稿或手写讲述"}</span></div></article>
      <footer className="photo-stage-footer">{pendingPeople ? <p>还有 {pendingPeople} 位人物未确认，请在“认人物”中确认或选择不记录。</p> : null}<button type="button" className="primary-action" disabled={locked || anyDirty || !story.trim()} onClick={() => void confirmStory()}>确认这份讲述<Icon name="arrow" size={14} /></button></footer>
    </section> : null}
    {step === 5 ? <section><header className="photo-stage-heading"><h3>{cleanPublished ? "这段记忆，已经收进理解" : "最后一步：把这份讲述收进你的理解"}</h3><p>只使用你确认的讲述和明确指定的人物，不猜测未命名者、关系或情绪。</p></header>
      <dl className="photo-build-summary"><div><dt>照片</dt><dd>{memory.photos.length} 张 · 保留在本地</dd></div><div><dt>{cleanPublished ? "已发布的头像" : "确认使用头像的人物"}</dt><dd className="photo-build-people">{named.filter(({ photo, person }) => !cleanPublished || memory.builtPeople?.some((entry) => entry.photoId === photo.id && entry.personId === person.id && entry.avatar)).map(({ photo, person }) => <span key={`${photo.id}:${person.id}`}><PhotoCrop src={photoAssetUrl(knowledgeBaseId, memory.id, photo.id)} person={person} width={photo.width} height={photo.height} alt="" />{person.name}</span>)}{!named.length || cleanPublished && !memory.builtPeople?.some((entry) => entry.avatar) ? "暂无头像关联" : null}</dd></div><div><dt>讲述</dt><dd>{story.trim().length} 字 · {memory.confirmedAt && !unsaved ? "已经确认" : "需要重新确认"}</dd></div><div><dt>收进理解的方式</dt><dd>根据确认的讲述整理，检查通过后发布人物与照片关联</dd></div></dl>
      {cleanPublished ? <div className="photo-stage-footer"><Link className="secondary-action" to="/relationships">查看人物与世界图谱<Icon name="arrow" size={14} /></Link></div> : <div className="photo-stage-footer">{!memory.confirmedAt || unsaved ? <p className="photo-help">{pendingPeople ? `还有 ${pendingPeople} 位人物未确认，请先在“认人物”中处理。` : "请在“确认讲述”中核对并保存故事，再构建。"}</p> : null}<button type="button" className="primary-action" disabled={locked || unsaved || !memory.confirmedAt} onClick={() => void start("build")}>{active ? "正在整理这段记忆…" : "构建这段记忆"}<Icon name="arrow" size={14} /></button></div>}
    </section> : null}
    <p className="photo-feedback" aria-live="polite">{busy || notice}</p>{error ? <p className="photo-error" role="alert">{error}</p> : null}
  </section>;
}
