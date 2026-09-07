import { TextArea } from "../../shared/form-controls";
import type { PhotoMemory } from "@the-way-here/shared";
import { PhotoFilmstrip } from "./PhotoFilmstrip";

export function PhotoNarration({ memory, selectedId, stories, legacyStory, locked, generatingId, onSelect, onStory, onLegacyStory, onGenerate }: {
  memory: PhotoMemory; selectedId: string; stories: Record<string, string>; legacyStory: string; locked: boolean; generatingId?: string;
  onSelect: (id: string) => void; onStory: (id: string, value: string) => void; onLegacyStory: (value: string) => void; onGenerate: (id: string) => void;
}) {
  const index = Math.max(0, memory.photos.findIndex((photo) => photo.id === selectedId));
  const photo = memory.photos[index];
  if (!photo) return null;
  const story = stories[photo.id] ?? "";
  const generating = generatingId === photo.id;
  return <section className="photo-narration-step">
    <PhotoFilmstrip memory={memory} selectedId={photo.id} stories={stories} onSelect={onSelect} />
    <header className="photo-stage-heading"><h3>这张照片的故事 <span className="photo-story-counter">{index + 1} / {memory.photos.length}</span></h3>
      <p aria-live="polite">{generating ? "AI 正在写这张照片的故事…" : story.trim() ? "这张已经写好了，随时可以接着改。" : <>这张还没写，可以自己写，也可以点 <button className="photo-assist-link" type="button" disabled={locked} onClick={() => onGenerate(photo.id)}>AI 帮你写</button>。</>}</p>
    </header>
    <label className="photo-story-label" htmlFor={`photo-story-${photo.id}`}>故事</label>
    <TextArea id={`photo-story-${photo.id}`} value={story} maxLength={10000} disabled={locked} rows={6} onChange={(event) => onStory(photo.id, event.target.value)} placeholder="这张照片是什么时候、发生了什么？" />
    {photo.storyOrigin === "ai" && story === photo.story ? <p className="photo-help">AI 起草，收进理解前请核对并修改。</p> : null}
    {legacyStory ? <details className="photo-legacy-story"><summary>之前保留的整段讲述</summary><p className="photo-help">原有讲述完整保留，可以继续修改。</p><TextArea aria-label="之前保留的整段讲述" value={legacyStory} disabled={locked} rows={5} maxLength={60000} onChange={(event) => onLegacyStory(event.target.value)} /></details> : null}
  </section>;
}
