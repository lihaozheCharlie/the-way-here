import { isTerminalRunStatus } from "@the-way-here/shared";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { photoAssetUrl, type PhotoBox, type PhotoMemory, type PhotoPerson, type RelationshipsView, type SourceImportBatch, type VaultInfo, type WikiRun } from "@the-way-here/shared";
import { api } from "../../api";
import { useApi } from "../../shared/use-api";
import { Icon } from "../../shared/ui";
import { openContextAgent } from "../collaboration/model";
import { clampPhotoBox } from "./photo-model";
import { parsePhotoDraft, photoDraftKey } from "./photo-draft";
import { detectPhotoBatch, detectionProgressLabel, type PhotoDetectionStatus } from "./photo-detection";
import { pendingPhotoPersonEdits, photoPersonQueue, type PhotoStep } from "./photo-flow";
import { assemblePhotoStories, photoStory, restorePhotoStories } from "./photo-stories";
import { detachFace, groupFaceFeatures, photoIdentityUpdates, reconcilePhotoDrafts, type FaceGroups, type FaceFeature } from "./photo-face-groups";
import { photoBoxesMatch } from "./photo-face-candidates";
import { PhotoProgress } from "./PhotoProgress";
import { PhotoPersonQueue } from "./PhotoPersonQueue";
import { PhotoNarration } from "./PhotoNarration";
import "./photo-memory.css";

const PHOTO_DETECTION_VERSION = 2;

// The batch remains bound to one knowledge base throughout annotation and generation.
export function PhotoMemoryPanel({ batch, revision }: { batch: SourceImportBatch; revision: number }) {
  const { data: vault } = useApi<VaultInfo>("/api/vault");
  return vault ? <BoundPhotoMemory key={`${vault.knowledgeBaseId}:${batch.id}`} batch={batch} knowledgeBaseId={vault.knowledgeBaseId} revision={revision} /> : <p>正在打开照片记忆…</p>;
}

function BoundPhotoMemory({ batch, knowledgeBaseId, revision }: { batch: SourceImportBatch; knowledgeBaseId: string; revision: number }) {
  const draftKey = photoDraftKey(knowledgeBaseId, batch.id);
  const [initialDraft] = useState(() => { try { return parsePhotoDraft(localStorage.getItem(draftKey)); } catch { return undefined; } });
  const detectionUpgrade = (initialDraft?.detectionVersion ?? 0) < PHOTO_DETECTION_VERSION;
  const base = `/api/photo-memories/${encodeURIComponent(batch.id)}`;
  const { data, error: loadError } = useApi<PhotoMemory>(`${base}?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`, revision);
  const { data: relationships } = useApi<RelationshipsView>("/api/views/relationships", revision);
  const people = relationships?.groups.flatMap((group) => group.people) || [];
  const { data: runs = [] } = useApi<WikiRun[]>("/api/runs", revision);
  const [memory, setMemory] = useState<PhotoMemory>();
  const previousMemory = useRef<PhotoMemory | undefined>(undefined);
  useEffect(() => {
    if (memory && previousMemory.current) {
      const before = previousMemory.current;
      setPhotoDrafts((drafts) => reconcilePhotoDrafts(before, memory, drafts));
    }
    previousMemory.current = memory;
  }, [memory?.revision]);
  const [step, setStep] = useState<PhotoStep>(2);
  const [selectedId, setSelectedId] = useState("");
  const [photoDrafts, setPhotoDrafts] = useState<Record<string, PhotoPerson[]>>({});
  const [faceGroups, setFaceGroups] = useState<FaceGroups>([]);
  const faceFeatures = useRef<FaceFeature[]>([]);
  const [groupingRevision, setGroupingRevision] = useState(0);
  const [photoStories, setPhotoStories] = useState<Record<string, string>>({});
  const [legacyStory, setLegacyStory] = useState("");
  const [selectedPhotoId, setSelectedPhotoId] = useState("");
  const [storyDirty, setStoryDirty] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [finishedRuns, setFinishedRuns] = useState<string[]>([]);
  const [startedRun, setStartedRun] = useState<WikiRun>();
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
        setFaceGroups(initialDraft.faceGroups ?? []);
      }
      const restored = restorePhotoStories(data, initialDraft);
      setPhotoStories(restored.stories); setLegacyStory(restored.legacyStory);
      setStoryDirty(Boolean(initialDraft?.storyDirty || Object.keys(restored.stories).length));
      setSelectedPhotoId(data.photos[0]?.id ?? "");
      setStep(initialDraft?.step ? initialDraft.step < 3 ? 2 : 3 : data.confirmedAt || data.draft || data.photos.some((photo) => photo.story?.trim()) ? 3 : 2);
    }
  }, [data]);
  useEffect(() => {
    if (!memory) return;
    const controller = new AbortController();
    setDetectionRunning(true);
    void detectPhotoBatch(memory.photos.map((photo) => ({ id: photo.id, url: photoAssetUrl(knowledgeBaseId, batch.id, photo.id) })), {
      signal: controller.signal,
      shouldSkip: (id) => completedDetections.current.has(id) || (!detectionUpgrade && Object.hasOwn(latestAnnotations.current.photoDrafts, id)) || Boolean(latestAnnotations.current.memory?.photos.find((photo) => photo.id === id)?.people.length),
      onStatus: (id, status) => {
        if (status.state !== "detecting") completedDetections.current.add(id);
        setDetection((current) => ({ ...current, [id]: status }));
      },
      onDetected: (id, boxes, descriptors) => {
        const existing = latestAnnotations.current.photoDrafts[id] ?? latestAnnotations.current.memory?.photos.find((photo) => photo.id === id)?.people ?? [];
        const candidates = boxes.map((box) => {
          const normalized = clampPhotoBox(box);
          return existing.find((person) => photoBoxesMatch(person.box, normalized)) ?? { id: crypto.randomUUID(), name: "", useAsAvatar: true, box: normalized };
        });
        candidates.forEach((person, i) => { const descriptor = descriptors?.[i]; if (descriptor) faceFeatures.current.push({ id: person.id, photoId: id, descriptor }); });
        setPhotoDrafts((current) => {
          if (!boxes.length) return current;
          const people = current[id] ?? latestAnnotations.current.memory?.photos.find((photo) => photo.id === id)?.people ?? [];
          const additions = candidates.filter((candidate) => !people.some((person) => person.id === candidate.id));
          return Object.hasOwn(current, id) && !additions.length ? current : { ...current, [id]: [...people, ...additions] };
        });
      },
    }).then(() => { if (!controller.signal.aborted) { setDetectionRunning(false); setGroupingRevision((value) => value + 1); } });
    return () => { controller.abort(); setDetectionRunning(false); faceFeatures.current = []; };
  }, [photoIds, detectionRetry, knowledgeBaseId, batch.id]);
  useEffect(() => {
    if (!memory || !groupingRevision) return;
    const eligible = new Set(photoPersonQueue(memory, photoDrafts).filter((entry) => !entry.confirmed && !entry.person.name && !entry.person.pageId).map((entry) => entry.person.id));
    const groups = groupFaceFeatures(faceFeatures.current.filter((face) => eligible.has(face.id)));
    faceFeatures.current = [];
    if (groups.length) setFaceGroups((current) => [...current, ...groups]);
  }, [groupingRevision]);
  const story = memory ? assemblePhotoStories(memory, photoStories, legacyStory) : "";
  const pendingPeople = memory ? pendingPhotoPersonEdits(memory, photoDrafts).length : 0;
  const anyDirty = pendingPeople > 0;
  const unsaved = anyDirty || storyDirty;
  const hasLocalDraft = Object.keys(photoDrafts).length > 0 || storyDirty;
  useEffect(() => {
    if (!memory) return;
    try {
      const photo = memory.photos[0]!;
      // Keep each photo draft and the original free-form story independently recoverable.
      if (hasLocalDraft || faceGroups.length || legacyStory) localStorage.setItem(draftKey, JSON.stringify({ revision: memory.revision, photoId: photo.id, people: photoDrafts[photo.id] ?? photo.people, peopleDirty: Object.hasOwn(photoDrafts, photo.id), story: legacyStory, storyDirty, photoDrafts, faceGroups, step, photoStories, legacyStory, detectionVersion: PHOTO_DETECTION_VERSION }));
      else localStorage.removeItem(draftKey);
      setDraftSaved(hasLocalDraft);
    } catch { setDraftSaved(false); setError("本机暂时无法保存草稿。离开前请确认保存，或复制保留讲述。"); }
  }, [draftKey, memory?.revision, hasLocalDraft, story, storyDirty, photoDrafts, faceGroups, step, photoStories, legacyStory]);
  useEffect(() => {
    if (!hasLocalDraft || draftSaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasLocalDraft, draftSaved]);
  const related = runs.filter((run) => run.knowledgeBaseId === knowledgeBaseId && (run.outputTarget?.kind === "photo-memory" && run.outputTarget.importId === batch.id || run.sourceContext?.importId === batch.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = related.find((run) => !finishedRuns.includes(run.id) && !isTerminalRunStatus(run.status)) ?? (startedRun && !related.some((run) => run.id === startedRun.id) ? startedRun : undefined);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const run = await api<WikiRun>(`/api/runs/${encodeURIComponent(active.id)}`, { signal: controller.signal });
        if (isTerminalRunStatus(run.status)) {
          const fresh = await api<PhotoMemory>(`${base}?knowledgeBaseId=${encodeURIComponent(knowledgeBaseId)}`, { signal: controller.signal });
          setMemory((current) => !current || fresh.revision >= current.revision ? fresh : current);
          setFinishedRuns((current) => [...current, run.id]);
          setStartedRun(undefined);
          if (run.status !== "completed") setError(run.error || "这次没有完成，可以重试。");
        }
      } catch (reason: any) { if (!controller.signal.aborted) setError(reason.message); }
      finally { fetching = false; }
    };
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [active?.id]);
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
  async function start(phase: "draft" | "build", current = memory, photoId?: string) {
    if (!current || locked) return;
    setError(""); setBusy(phase === "draft" ? "AI 正在写…" : "正在收进理解…");
    try {
      const isBuild = phase === "build";
      const run = await api<WikiRun>("/api/runs", { method: "POST", body: JSON.stringify({
        knowledgeBaseId, mode: isBuild ? "write" : "read", title: `${isBuild ? "构建" : "写故事"} · ${current.title}`,
        displayPrompt: isBuild ? "收进这段照片记忆" : "为这张照片直接起草故事",
        prompt: isBuild ? `请按 build-wiki 的导入后冷启构建入口读取「${current.reportPath}」。只摄取“用户确认的讲述”和用户明确指定的人物；保留来源不变，不猜测未命名者、关系或情绪。已选人物必须沿用页面关联；其余称呼可结合姓名、别名、上下文匹配已有档案，包括“我”和“自己”，无需二次询问。完成派生内容和质量门，并说明更新或跳过的内容。` : "请为所选照片直接起草一段故事，填回照片的故事栏，不需要向用户提问。",
        ...(!isBuild ? { outputTarget: { kind: "photo-memory", importId: batch.id, storedPath: current.reportPath, label: current.title, phase, photoId } } : { sourceContext: { importId: batch.id, storedPath: current.reportPath, flow: "dialogue", operation: "build" } }),
      }) });
      setStartedRun(run);
    } catch (reason: any) { setError(reason.message); } finally { setBusy(""); }
  }
  async function generateStory(photoId: string) {
    if (!memory || locked || photoStory(memory, photoStories, photoId).trim()) return;
    const saved = Object.keys(photoStories).length ? await save({ photoStories: Object.entries(photoStories).map(([photoId, story]) => ({ photoId, story })) }) : memory;
    if (!saved) return;
    setPhotoStories({});
    await start("draft", saved, photoId);
  }
  async function collectMemory() {
    if (!memory || locked || anyDirty || !story.trim()) return;
    if (story.length > 60000) { setError("故事合计超过 6 万字，请精简后再收进理解。"); return; }
    const saved = await save({ story, photoStories: memory.photos.map((photo) => ({ photoId: photo.id, story: photoStory(memory, photoStories, photo.id) })) });
    if (!saved) return;
    setPhotoStories({}); setStoryDirty(false);
    await start("build", saved);
  }
  function editPerson(photoId: string, personId: string, patch: Partial<PhotoPerson>) {
    if (!memory) return;
    setPhotoDrafts((drafts) => ({ ...drafts, [photoId]: (drafts[photoId] ?? memory.photos.find((photo) => photo.id === photoId)!.people).map((person) => person.id === personId ? { ...person, ...patch } : person) }));
  }

  function addPerson(photoId: string, box: PhotoBox) {
    if (!memory || locked) return;
    const person: PhotoPerson = { id: crypto.randomUUID(), name: "", useAsAvatar: true, box: clampPhotoBox(box) };
    setPhotoDrafts((drafts) => ({ ...drafts, [photoId]: [...(drafts[photoId] ?? memory.photos.find((photo) => photo.id === photoId)!.people), person] }));
    completedDetections.current.add(photoId);
    setSelectedId(person.id);
  }

  async function resolvePerson(photoId: string, person: PhotoPerson, skip: boolean, keepSelected = false) {
    if (!memory || locked) return;
    const updates = skip ? [{ photoId, people: memory.photos.find((photo) => photo.id === photoId)!.people.filter((item) => item.id !== person.id) }] : photoIdentityUpdates(memory, photoDrafts, faceGroups, person.id, person);
    const saved = skip && !memory.photos.find((photo) => photo.id === photoId)!.people.some((item) => item.id === person.id) ? memory : await save({ photos: updates });
    if (!saved) return;
    const updatedIds = new Set(updates.flatMap((update) => update.people.map((item) => item.id)));
    setPhotoDrafts((drafts) => {
      const next = { ...drafts };
      for (const update of updates) {
        completedDetections.current.add(update.photoId);
        const savedPeople = saved.photos.find((photo) => photo.id === update.photoId)!.people;
        next[update.photoId] = (drafts[update.photoId] ?? savedPeople).flatMap((item) => skip && item.id === person.id ? [] : [updatedIds.has(item.id) ? savedPeople.find((saved) => saved.id === item.id)! : item]);
      }
      return next;
    });
    if (skip) setFaceGroups((groups) => detachFace(groups, person.id));
    if (!keepSelected) setSelectedId("");
    if (!skip && updates.length > 1) setNotice(`已同步更新 ${updates.length} 张照片中的「${person.name}」。`);
  }
  async function separateFace(id: string) {
    if (!memory || locked) return;
    const entry = photoPersonQueue(memory, photoDrafts).find((entry) => entry.person.id === id);
    if (!entry) return;
    if (entry.person.groupId && entry.person.name) {
      const saved = await save({ photos: [{ photoId: entry.photo.id, people: entry.photo.people.map((person) => person.id === id ? { ...person, groupId: undefined } : person) }] });
      if (!saved) return;
      setPhotoDrafts((drafts) => ({ ...drafts, [entry.photo.id]: (drafts[entry.photo.id] ?? entry.photo.people).map((person) => person.id === id ? { ...person, groupId: undefined } : person) }));
    }
    setFaceGroups((groups) => detachFace(groups, id));
    setNotice("已移出这组，这张可以单独标注。");
  }
  function editStory(id: string, value: string) {
    if (!memory) return;
    const next = { ...photoStories, [id]: value };
    if (assemblePhotoStories(memory, next, legacyStory).length > 60000) { setError("故事合计最多 6 万字，请精简后再补充。"); return; }
    setPhotoStories(next); setStoryDirty(true); setError("");
  }
  function editLegacyStory(value: string) {
    if (!memory) return;
    if (assemblePhotoStories(memory, photoStories, value).length > 60000) { setError("故事合计最多 6 万字，请精简后再补充。"); return; }
    setLegacyStory(value); setStoryDirty(true); setError("");
  }
  function navigateStep(next: PhotoStep) {
    if (locked) return;
    setStep(next); setSelectedId(""); setNotice("");
  }

  if (loadError) return <section className="photo-memory"><p role="alert">{loadError}</p></section>;
  if (!memory) return <section className="photo-memory"><p>正在打开这段记忆…</p></section>;
  const allPeople = photoPersonQueue(memory, photoDrafts);
  const completedSteps: PhotoStep[] = [...(allPeople.length && allPeople.every((person) => person.confirmed) && !detectionRunning ? [2 as const] : [])];
  const stories = Object.fromEntries(memory.photos.map((photo) => [photo.id, photoStory(memory, photoStories, photo.id)]));
  const generatingId = active?.outputTarget?.kind === "photo-memory" && active.outputTarget.phase === "draft" ? active.outputTarget.photoId : undefined;
  return <section ref={panelRef} className="photo-memory photo-memory-redesign" aria-label="照片记忆工作区">
    <header className="photo-memory-head"><img className="photo-memory-cover" src={photoAssetUrl(knowledgeBaseId, memory.id, memory.photos[0]!.id)} alt="" /><div><h2>{memory.title}</h2><p>{memory.photos.length} 张照片 · 原图保留在本地</p></div></header>
    <PhotoProgress step={step} completed={completedSteps} disabled={locked} onStep={navigateStep} />
    <div className="photo-memory-body">
      {step === 2 ? <PhotoPersonQueue memory={memory} drafts={photoDrafts} groups={faceGroups} onDetach={(id) => void separateFace(id)} groupingError={Object.values(detection).find((status) => status.groupingError)?.groupingError} selectedId={selectedId} photoId={selectedPhotoId} people={people} locked={locked} onSelect={setSelectedId} onPhoto={(id) => { setSelectedPhotoId(id); setSelectedId(""); }} onChange={editPerson} onAdd={addPerson} onConfirm={(id, person) => void resolvePerson(id, person, false)} onCommitBox={(id, person) => void resolvePerson(id, person, false, true)} onSkip={(id, person) => void resolvePerson(id, person, true)} detecting={detectionRunning} detectionLabel={detectionProgressLabel(memory.photos, detection)} detectionError={Object.values(detection).find((status) => status.state === "failed")?.error} onRetry={() => { for (const [id, status] of Object.entries(detection)) if (status.state === "failed") completedDetections.current.delete(id); setDetectionRetry((value) => value + 1); }} /> :
        <PhotoNarration memory={memory} selectedId={selectedPhotoId} stories={stories} legacyStory={legacyStory} locked={locked} generatingId={generatingId} onSelect={setSelectedPhotoId} onStory={editStory} onLegacyStory={editLegacyStory} onGenerate={(id) => void generateStory(id)} />}
      {active ? <p className="photo-feedback" role="status">{generatingId ? "生成后会自动填回对应照片。" : "正在把这段记忆收进理解…"}<button type="button" onClick={() => openContextAgent({ runId: active.id })}>查看进度</button></p> : null}
      {cleanPublished ? <p className="photo-feedback" role="status">这段记忆已经收进理解。<Link to="/relationships">查看人物与世界图谱</Link></p> : null}
      <p className="photo-feedback" aria-live="polite">{busy || notice}</p>{error ? <p className="photo-error" role="alert">{error}</p> : null}
      {step === 3 && pendingPeople ? <p className="photo-help">还有 {pendingPeople} 位人物的修改未保存，请回到“认人”中保存或移除。</p> : null}
    </div>
    <footer className="photo-memory-footer">
      <button type="button" className="photo-text-action" disabled={locked || step === 2} onClick={() => navigateStep(2)}>上一步</button>
      <div>{step === 2 ? <><button type="button" className="photo-text-action photo-foot-skip" disabled={locked} onClick={() => navigateStep(3)}>跳过这步</button><button type="button" className="primary-action" disabled={locked} onClick={() => navigateStep(3)}>下一步<Icon name="arrow" size={14} /></button></> : <button type="button" className="primary-action" disabled={locked || anyDirty || !story.trim() || cleanPublished} onClick={() => void collectMemory()}>{cleanPublished ? "已收进理解" : "收进理解"}<Icon name="arrow" size={14} /></button>}</div>
    </footer>
  </section>;
}
