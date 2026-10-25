import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../shared/ui";
import { useDismissLayer } from "../../shared/use-dismiss-layer";
import { useI18n } from "../../shared/i18n";
import "./source-list-options.css";

export function SourceListOptions({ months, month, oldestFirst, total, onMonth, onOrder, onBatchSelect, disabled = false, includeChildren, onScope }: {
  months: { id: string; count: number }[]; month: string; oldestFirst: boolean; total: number;
  onMonth: (month: string) => void; onOrder: (oldestFirst: boolean) => void; onBatchSelect?: () => void; disabled?: boolean; includeChildren?: boolean; onScope?: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const { t } = useI18n();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useDismissLayer(open, close, { element: root, outside: true });
  useEffect(() => { if (open) menu.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [open]);
  return <div ref={root} className="source-list-options">
    <button ref={trigger} type="button" className="pane-shelf-option" disabled={disabled} aria-label={t("筛选与排序")} title={t("筛选与排序")} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}><Icon name="more" size={16} /></button>
    {open && <div ref={menu} id={id} role="menu" aria-label={t("筛选与排序")} className="source-list-options-menu" onKeyDown={event => {
      const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if (event.key === "Tab") { setOpen(false); return; }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>
      <div role="group" aria-label={t("排序")}><p>{t("排序")}</p>{[false, true].map(value => <button type="button" key={String(value)} role="menuitemradio" aria-checked={oldestFirst === value} onClick={() => { onOrder(value); close(); }}><span>{value ? t("最早在前") : t("最新在前")}</span>{oldestFirst === value && <Icon name="check" size={14} />}</button>)}</div>
      <div role="group" aria-label={t("月份")}><p>{t("月份")}</p><div className="source-list-options-months">{[{ id: "", count: total }, ...months].map(item => <button type="button" key={item.id} role="menuitemradio" aria-checked={month === item.id} onClick={() => { onMonth(item.id); close(); }}><span>{item.id ? t("${year} 年 ${month} 月", { year: item.id.slice(0, 4), month: Number(item.id.slice(5)) }) : t("全部月份")}</span><small>{item.count}</small>{month === item.id && <Icon name="check" size={14} />}</button>)}</div></div>
      {onScope && <div role="group" aria-label={t("范围")}><p>{t("范围")}</p>{[false, true].map(value => <button type="button" key={String(value)} role="menuitemradio" aria-checked={includeChildren === value} onClick={() => { onScope(value); close(); }}><span>{value ? t("含子文件夹") : t("仅此层")}</span>{includeChildren === value && <Icon name="check" size={14} />}</button>)}</div>}
      <button type="button" role="menuitem" disabled={!onBatchSelect} title={onBatchSelect ? undefined : t("当前没有可批量构建的记录")} onClick={() => { onBatchSelect?.(); close(); }}>{t("批量选择…")}</button>
    </div>}
  </div>;
}
