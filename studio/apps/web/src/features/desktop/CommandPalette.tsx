import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WikiPageSummary } from "@the-way-here/shared";
import { api } from "../../api";
import { pageDestination } from "../../shared/routing";
import { Icon } from "../../shared/ui";
export function CommandPalette({ onClose, onCapture, onSettings, routes }: { routes: Array<{ title: string; to: string }>; onClose: () => void; onCapture: () => void; onSettings: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WikiPageSummary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement; input.current?.focus(); return () => previous?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setSelected(0); setError(""); setResults([]);
    if (!query.trim()) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => { api<WikiPageSummary[]>(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(setResults).catch((e) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const commands = [ ...routes.filter((item) => !query || item.title.includes(query)).map((item) => ({ title: item.title, detail: "前往栏目", action: () => navigate(item.to) })), ...(!query ? [{ title: "随手记", detail: "⌘N", action: onCapture }, { title: "偏好设置", detail: "⌘,", action: onSettings }] : []), ...results.slice(0, 12).map((page) => ({ title: page.title, detail: page.isSource ? "生活记录" : "已有理解", action: () => navigate(pageDestination(page)) })) ];
  function choose(index: number) { commands[index]?.action(); onClose(); }
  return <div className="desktop-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="command-palette" role="dialog" aria-modal="true" aria-label="搜索与命令" onKeyDown={(e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") { e.preventDefault(); input.current?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setSelected((value) => Math.max(0, Math.min(commands.length - 1, value + (e.key === "ArrowDown" ? 1 : -1)))); }
      if (e.key === "Enter" && !e.nativeEvent.isComposing && commands.length) { e.preventDefault(); choose(selected); }
    }}>
      <div className="command-input"><Icon name="search" size={20} /><input ref={input} role="combobox" aria-label="搜索记录、理解或命令" aria-expanded="true" aria-controls="command-results" aria-activedescendant={commands.length ? `command-${selected}` : undefined} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索记录、理解，或前往…" /><button onClick={onClose}>esc</button></div>
      <div id="command-results" className="command-results" role="listbox">{commands.map((item, index) => <button id={`command-${index}`} tabIndex={-1} role="option" aria-selected={index === selected} className={index === selected ? "selected" : ""} key={`${item.title}-${index}`} onMouseEnter={() => setSelected(index)} onClick={() => choose(index)}><span>{item.title}</span><small>{item.detail}</small></button>)}{loading ? <p role="status">正在查找…</p> : error ? <p role="alert">{error}</p> : !commands.length ? <p>没有找到相关内容，试试其他关键词。</p> : null}</div>
      <footer>↑ ↓ 选择 <span>↵ 打开</span><span>esc 关闭</span></footer>
    </section>
  </div>;
}
