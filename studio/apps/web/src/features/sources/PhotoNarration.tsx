import { useId, useState } from "react";
import { MemoryWritingAssist } from "./MemoryWritingAssist";
import { TextArea } from "../../shared/form-controls";
import { photoAssetUrl, type PhotoMemory } from "@the-way-here/shared";
import { useDemoJsonText, useI18n } from "../../shared/i18n";

export function PhotoNarration({ memory, story, locked, generating, onStory, onGenerate, onStoryFocus, onStoryBlur, background = "", onBackground = () => {} }: {
  memory: PhotoMemory; story: string; locked: boolean; generating: boolean;
  onStory: (value: string) => void; onGenerate: () => void; onStoryFocus?: () => void; onStoryBlur?: () => void; background?: string; onBackground?: (value: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const galleryId = useId();
  const { t } = useI18n();
  const demoText = useDemoJsonText();
  const memoryFile = `sources/.photo-memories/${memory.id}/memory.json`;
  const names = Array.from(new Set(memory.photos.flatMap((photo, photoIndex) => photo.people.map((person, personIndex) => demoText(memoryFile, `$.photos[${photoIndex}].people[${personIndex}].name`, person.name).trim()).filter(Boolean))));
  return <section className="photo-narration-step">
    <div id={galleryId} className="photo-story-gallery" role="group" aria-label={t("一起讲故事的照片")}>
      {(showAll ? memory.photos : memory.photos.slice(0,14)).map((photo, index) => <img key={photo.id} src={photoAssetUrl(memory.knowledgeBaseId, memory.id, photo.id)} alt={t("第 ${index} 张：${name}", { index: index + 1, name: demoText(memoryFile, `$.photos[${index}].name`, photo.name) })} />)}
      {memory.photos.length > 14 && <button type="button" className="photo-gallery-toggle" aria-expanded={showAll} aria-controls={galleryId} onClick={() => setShowAll(value => !value)}>{showAll ? t("收起照片") : t("+${count} 张 · 展开全部", { count: memory.photos.length - 14 })}</button>}
    </div>
    <header className="photo-stage-heading photo-story-heading">
      <div><h3>{t("这些照片里的故事")} <span className="photo-story-counter">{t("${count} 张照片 · 一篇故事", { count: memory.photos.length })}</span></h3>
        <p aria-live="polite">{generating ? t("AI 正在把这些照片串成一个故事…") : story.trim() ? t("故事已经写下来了，随时可以接着改。") : t("把这些照片里的经历，一起写成一个故事。")}</p>
      </div>

    </header>
    <MemoryWritingAssist inline background={background} onBackground={onBackground} disabled={locked} generating={generating} onGenerate={onGenerate} context={[...(names.length ? [{ text: t("已认出：${names}", { names: names.join(t("、")) }), icon: "people" as const }] : []), { text: t("${count} 张照片", { count: memory.photos.length }), icon: "image" }]} placeholder={t("补充一点照片背后的线索，比如和谁一起、那天发生了什么特别的事……")} />
    <label className="photo-story-label" htmlFor="photo-group-story">{t("故事")}</label>
    <TextArea id="photo-group-story" value={story} maxLength={60000} disabled={locked} rows={6} onFocus={onStoryFocus} onBlur={onStoryBlur} onChange={(event) => onStory(event.target.value)} placeholder={t("这些照片串起了我的哪段经历？当时和谁在一起，发生了什么？")} />
    {story.trim() && !memory.confirmedAt ? <p className="photo-help">{t("收进理解前请核对并修改，尤其是 AI 起草的内容。")}</p> : null}
  </section>;
}
