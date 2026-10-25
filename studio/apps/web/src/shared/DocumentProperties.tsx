import { tr } from "./i18n";
import { useState } from "react";
import type { WikiPage } from "@the-way-here/shared";
import { useI18n } from "./i18n";

type NotePropertyKind = "text" | "aliases" | "tags" | "date" | "list" | "boolean";

function notePropertyKind(key: string, value: unknown): NotePropertyKind {
  const normalized = key.toLocaleLowerCase();
  if (normalized === "tags" || normalized === "tag") return "tags";
  if (normalized === "aliases" || normalized === "alias") return "aliases";
  if (["start", "end", "date", "created", "updated", "imported_at"].includes(normalized) || /\d{4}-\d{2}-\d{2}/.test(String(value || ""))) return "date";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "list";
  return "text";
}

function NotePropertyIcon({ kind }: { kind: NotePropertyKind }) {
  const content = kind === "tags"
    ? <><path d="M4 5.5V11l8 8 7-7-8-8H5.5A1.5 1.5 0 0 0 4 5.5Z" /><circle cx="8" cy="8" r="1" /></>
    : kind === "aliases"
      ? <><path d="M8 8h8v8" /><path d="m8 16 8-8" /><path d="M5 12v6a1 1 0 0 0 1 1h6" /></>
      : kind === "date"
        ? <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></>
        : kind === "boolean"
          ? <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 3 3 5-6" /></>
          : kind === "list"
            ? <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="5" cy="6" r="1" /><circle cx="5" cy="12" r="1" /><circle cx="5" cy="18" r="1" /></>
            : <><path d="M5 7h14M5 12h10M5 17h14" /></>;
  return <svg className="note-property-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{content}</svg>;
}

function propertyLabel(value: unknown, kind: NotePropertyKind): string {
  if (value === null || value === undefined || value === "") return tr("没有值");
  if (typeof value === "boolean") return value ? tr("是") : tr("否");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value).replace(/^\[\[/, "").replace(/\]\]$/, "");
  return kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.replaceAll("-", "/") : text;
}

function propertyHasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.some(propertyHasValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(propertyHasValue);
  return true;
}

export function NoteProperties({ properties, compact = false }: { properties: Record<string, unknown>; compact?: boolean }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(properties).filter(([, value]) => propertyHasValue(value));
  if (!entries.length) return null;
  const tagCount = Array.isArray(properties.tags) ? properties.tags.length : properties.tags ? 1 : 0;
  const when = properties.date || properties.Start ? String(properties.date || properties.Start).slice(0, 10) : "";
  return <section className={`note-properties${compact ? " compact" : ""}`} aria-label={t("笔记属性")}>
    <div className="note-property-summary"><span>{String(properties.type || properties["类型"] || t("笔记"))} · {t("${count} 个标签", { count: tagCount })}{when ? ` · ${when}` : ""}</span><button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? t("收起属性") : t("展开全部属性")}</button></div>
    <dl hidden={!expanded}>{entries.map(([key, value]) => {
      const kind = notePropertyKind(key, value);
      const values = Array.isArray(value) ? value : [value];
      return <div className={`note-property note-property--${kind}`} key={key}>
        <NotePropertyIcon kind={kind} />
        <dt>{key}</dt>
        <dd>{values.map((entry, index) => <span className={kind === "tags" || kind === "aliases" ? "note-property-token" : "note-property-value"} key={`${key}-${index}`}>{propertyLabel(entry, kind)}</span>)}</dd>
      </div>;
    })}</dl>
  </section>;
}

export function SourceProperties({ properties }: { properties: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(properties).filter(([, value]) => propertyHasValue(value));
  const labels: Record<string, string> = { type: tr("类型"), tags: tr("标签"), aliases: tr("别名"), source: tr("来源"), status: tr("状态"), Start: tr("开始"), end: tr("结束"), location: tr("地点") };
  const tokens = entries.flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((entry) => {
    const text = propertyLabel(entry, notePropertyKind(key, value));
    const tag = key === "tags" ? text.match(/^(类型|人物|实体|索引|来源)\/(.+)$/) : null;
    const label = tag?.[1] ? tr(tag[1]) : labels[key] || key;
    return { label, value: tag?.[2] || text, rank: tag?.[1] === "类型" || key === "type" ? 0 : tag?.[1] === "人物" ? 1 : 2 };
  })).sort((a, b) => a.rank - b.rank);
  if (!tokens.length) return null;
  return <section className="source-property-summary" aria-label={tr("记录标签")}>
    {(expanded ? tokens : tokens.slice(0, 2)).map((token, index) => <span className="source-property-chip" key={index}>{token.label}<b>{token.value}</b></span>)}
    {tokens.length > 2 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? tr("收起标签") : tr("+${p0} 个标签", { "p0": tokens.length - 2 })}</button>}
  </section>;
}

export function pageNoteProperties(page: WikiPage): Record<string, unknown> {
  if (page.properties && Object.keys(page.properties).length) return Object.fromEntries(Object.entries(page.properties).filter(([, value]) => propertyHasValue(value)));
  const entries: Array<[string, unknown]> = [
    ["type", page.type],
    ["aliases", page.aliases.length ? page.aliases : undefined],
    ["tags", page.tags.length ? page.tags : undefined],
    ["status", page.status],
    ["Start", page.start],
    ["end", page.end],
    ["location", page.locations.length ? page.locations : undefined],
    ["source", page.sources.length ? page.sources : undefined],
  ];
  return Object.fromEntries(entries.filter((entry) => entry[1] !== undefined));
}
