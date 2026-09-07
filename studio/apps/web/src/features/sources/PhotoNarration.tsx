import { Icon } from "../../shared/ui";
import { TextArea } from "../../shared/form-controls";
import { photoAssetUrl, type PhotoMemory } from "@the-way-here/shared";

export function PhotoNarration({ memory, story, locked, generating, onStory, onGenerate }: {
  memory: PhotoMemory; story: string; locked: boolean; generating: boolean;
  onStory: (value: string) => void; onGenerate: () => void;
}) {
  return <section className="photo-narration-step">
    <div className="photo-story-gallery" role="group" aria-label="一起讲故事的照片">
      {memory.photos.map((photo, index) => <img key={photo.id} src={photoAssetUrl(memory.knowledgeBaseId, memory.id, photo.id)} alt={`第 ${index + 1} 张：${photo.name}`} />)}
    </div>
    <header className="photo-stage-heading photo-story-heading">
      <div><h3>这些照片里的故事 <span className="photo-story-counter">{memory.photos.length} 张照片 · 一篇故事</span></h3>
        <p aria-live="polite">{generating ? "AI 正在把这些照片串成一个故事…" : story.trim() ? "故事已经写下来了，随时可以接着改。" : "把这些照片里的经历，一起写成一个故事。"}</p>
      </div>
      {(!story.trim() || generating) ? <button className="primary-action photo-story-assist" type="button" disabled={locked || generating} onClick={onGenerate}><Icon name="spark" size={17} />{generating ? "正在写故事…" : "AI 帮你写"}</button> : null}
    </header>
    <label className="photo-story-label" htmlFor="photo-group-story">故事</label>
    <TextArea id="photo-group-story" value={story} maxLength={60000} disabled={locked} rows={6} onChange={(event) => onStory(event.target.value)} placeholder="这些照片串起了我的哪段经历？当时和谁在一起，发生了什么？" />
    {story.trim() && !memory.confirmedAt ? <p className="photo-help">收进理解前请核对并修改，尤其是 AI 起草的内容。</p> : null}
  </section>;
}
