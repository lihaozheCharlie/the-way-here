import { useEffect, useId, useRef, useState } from "react";
import type { PhotoPerson } from "@the-way-here/shared";

export type PhotoPersonOption = { id: string; title: string; aliases?: string[] };
export function matchingPhotoAliases(person: PhotoPersonOption, query: string) {
  const term = query.trim().toLocaleLowerCase();
  return term ? (person.aliases ?? []).filter((alias) => alias.toLocaleLowerCase().includes(term)) : [];
}
export function matchingPhotoPeople(people: PhotoPersonOption[], query: string) {
  const term = query.trim().toLocaleLowerCase();
  return people.filter((person) => person.title.toLocaleLowerCase().includes(term) || matchingPhotoAliases(person, query).length > 0);
}

export function PhotoPersonPicker({ person, people, onChange, compact = false }: { compact?: boolean; person: PhotoPerson; people: PhotoPersonOption[]; onChange: (patch: Partial<PhotoPerson>) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matchesRef = useRef<HTMLDivElement>(null);
  const matches = matchingPhotoPeople(people, query);
  const options = [...matches.map((p) => ({ pageId: p.id, name: p.title })), ...(query.trim() ? [{ pageId: undefined, name: query.trim() }] : [])];
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  useEffect(() => {
    const list = matchesRef.current;
    const option = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [open, activeIndex, query]);
  function showOptions() {
    if (open) return;
    setQuery(person.name); setActive(0); setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange({ ...option, useAsAvatar: true });
    inputRef.current?.focus({ preventScroll: true });
    setOpen(false); setQuery(option.name);
  }
  return <>
    <div className="photo-person-picker" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <label htmlFor={id}>{compact ? "搜索或填写称呼" : "关联人物"}</label>
      <input ref={inputRef} id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open && options.length ? `${id}-option-${activeIndex}` : undefined}
        value={open ? query : person.name} placeholder="搜索姓名、别名，或填写新称呼" autoComplete="off" maxLength={100}
        onFocus={showOptions} onClick={showOptions}
        onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) { showOptions(); return; }
            if (options.length) setActive((activeIndex + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
          }
          if (event.key === "Enter" && open) { event.preventDefault(); choose(activeIndex); }
        }} />
      {open ? <div id={`${id}-list`} role="listbox" aria-label="选择已有人物或使用新称呼" className="photo-person-options">
        <div role="group" aria-labelledby={`${id}-existing`}>
          <p className="photo-person-group-title" id={`${id}-existing`}>已有人物{matches.length ? ` · ${matches.length}` : ""}</p>
          {matches.length ? <div ref={matchesRef} className="photo-person-existing-options">{matches.map((option, index) => <button type="button" role="option" id={`${id}-option-${index}`} aria-selected={index === activeIndex} key={option.id} tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}><span>{option.title}{matchingPhotoAliases(option, query).length ? <small className="photo-person-alias">匹配别名：{matchingPhotoAliases(option, query).join("、")}</small> : null}</span><small>关联已有人物</small></button>)}</div> : <p className="photo-person-empty">{people.length ? "没有匹配的已有人物，可以换个关键词。" : "还没有已有人物，输入一个称呼开始记录。"}</p>}
        </div>
        {query.trim() ? <div role="group" aria-labelledby={`${id}-new`} className="photo-person-new-group"><p className="photo-person-group-title" id={`${id}-new`}>使用称呼</p><button type="button" role="option" id={`${id}-option-${matches.length}`} aria-selected={activeIndex === matches.length} tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(matches.length)}><span>使用新称呼「{query.trim()}」</span><small>构建时由模型匹配已有档案</small></button></div> : null}
      </div> : null}
      {compact && person.name.trim() ? <p className="photo-person-selection" role="status"><b>{person.pageId ? "已选择已有人物" : "已选择称呼，构建时匹配"}</b><span>{person.name}</span>{!person.pageId && matches.some((match) => [match.title, ...(match.aliases ?? [])].some((name) => name.toLocaleLowerCase() === person.name.trim().toLocaleLowerCase())) ? <small>有姓名或别名相同的人物；如是同一人，请从上方选择关联。</small> : null}</p> : null}
    </div>
    {!compact && !person.pageId ? <label>怎么称呼<input value={person.name} maxLength={100} onChange={(event) => onChange({ name: event.target.value, useAsAvatar: true })} placeholder="姓名、称呼，或“我”" /></label> : null}
  </>;
}
