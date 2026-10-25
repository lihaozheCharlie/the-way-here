import { photoAssetUrl, type PhotoMemory } from "@the-way-here/shared";
import { useI18n } from "../../shared/i18n";

export function PhotoFilmstrip({ memory, selectedId, onSelect, disabled, stories, identified }: {
  memory: PhotoMemory; selectedId: string; onSelect: (id: string) => void; disabled?: boolean; stories?: Record<string, string>; identified?: Record<string, "done" | "pending" | "empty">;
}) {
  const { t } = useI18n();
  return <>
    <nav className="photo-memory-filmstrip" aria-label={t(stories ? "选择要讲故事的照片" : "选择要认人的照片")}>
      {memory.photos.map((photo, index) => {
        const done = stories ? Boolean(stories[photo.id]?.trim()) : identified?.[photo.id] === "done";
        const status = stories ? done ? t("写好了") : t("还没写") : identified?.[photo.id] === "done" ? t("已认完") : identified?.[photo.id] === "pending" ? t("认了一部分") : t("待认领");
        return <button key={photo.id} type="button" disabled={disabled} aria-pressed={selectedId === photo.id} aria-label={t("第 ${index} 张：${name}", { index: index + 1, name: photo.name }) + (stories || identified ? t("，${status}", { status }) : "")} onClick={() => onSelect(photo.id)}>
          <img src={photoAssetUrl(memory.knowledgeBaseId, memory.id, photo.id)} alt="" />
          {stories || identified?.[photo.id] !== undefined && identified[photo.id] !== "empty" ? <span className={`photo-story-dot ${done ? "done" : "pending"}`} aria-hidden="true" /> : null}
        </button>;
      })}
    </nav>
    {stories || identified ? <div className="photo-filmstrip-legend"><span><i className="done" />{stories ? t("写好了") : t("已认完")}</span><span><i className="pending" />{stories ? t("还没写") : t("认了一部分")}</span></div> : null}
  </>;
}
