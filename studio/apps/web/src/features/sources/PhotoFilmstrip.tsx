import { photoAssetUrl, type PhotoMemory } from "@the-way-here/shared";

export function PhotoFilmstrip({ memory, selectedId, onSelect, disabled, stories, identified }: {
  memory: PhotoMemory; selectedId: string; onSelect: (id: string) => void; disabled?: boolean; stories?: Record<string, string>; identified?: Record<string, "done" | "pending" | "empty">;
}) {
  return <>
    <nav className="photo-memory-filmstrip" aria-label={stories ? "选择要讲故事的照片" : "选择要认人的照片"}>
      {memory.photos.map((photo, index) => {
        const done = stories ? Boolean(stories[photo.id]?.trim()) : identified?.[photo.id] === "done";
        const status = stories ? done ? "写好了" : "还没写" : identified?.[photo.id] === "done" ? "已认完" : identified?.[photo.id] === "pending" ? "认了一部分" : "待认领";
        return <button key={photo.id} type="button" disabled={disabled} aria-pressed={selectedId === photo.id} aria-label={`第 ${index + 1} 张：${photo.name}${stories || identified ? `，${status}` : ""}`} onClick={() => onSelect(photo.id)}>
          <img src={photoAssetUrl(memory.knowledgeBaseId, memory.id, photo.id)} alt="" />
          {stories || identified?.[photo.id] !== undefined && identified[photo.id] !== "empty" ? <span className={`photo-story-dot ${done ? "done" : "pending"}`} aria-hidden="true" /> : null}
        </button>;
      })}
    </nav>
    {stories || identified ? <div className="photo-filmstrip-legend"><span><i className="done" />{stories ? "写好了" : "已认完"}</span><span><i className="pending" />{stories ? "还没写" : "认了一部分"}</span></div> : null}
  </>;
}
