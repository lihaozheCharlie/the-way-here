import path from "node:path";
import type { PageSection, SourceImportChannel, WikiLink } from "@the-way-here/shared";
import { withoutExtension } from "./page-paths.js";

export function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}

const sourceImportChannels = new Set<SourceImportChannel>(["files", "chatgpt", "claude", "gemini", "deepseek", "doubao", "other-ai", "alipay", "photos"]);

export function sourceImportChannel(value: unknown): SourceImportChannel | undefined {
  if (typeof value !== "string") return undefined;
  const channel = value.trim().toLocaleLowerCase() as SourceImportChannel;
  return sourceImportChannels.has(channel) ? channel : undefined;
}

export function dateValue(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function normalizePropertyValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalizePropertyValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, normalizePropertyValue(entry)]));
  }
  if (value === undefined) return null;
  return value;
}

export function normalizeFrontmatterProperties(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, normalizePropertyValue(value)]));
}

export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_`~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitle(markdown: string, relativePath: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || path.posix.basename(withoutExtension(relativePath));
}

export function extractSections(markdown: string): PageSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: PageSection[] = [];
  let current: PageSection | undefined;
  for (const line of lines) {
    const heading = line.match(/^(#{2,6})\s+(.+?)\s*$/);
    if (heading) {
      if (current) current.body = current.body.trim();
      current = { level: heading[1]!.length, heading: heading[2]!.trim(), body: "" };
      sections.push(current);
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) current.body = current.body.trim();
  return sections;
}

/**
 * Extract complete sections at one heading level. Deeper headings remain in
 * the parent body, which is what overview cards and expandable domains need.
 */
export function extractSectionBlocks(markdown: string, level = 2): PageSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: PageSection[] = [];
  let current: PageSection | undefined;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    const headingLevel = heading?.[1]?.length;
    if (heading && headingLevel === level) {
      if (current) current.body = current.body.trim();
      current = { level, heading: heading[2]!.trim(), body: "" };
      sections.push(current);
      continue;
    }
    if (heading && headingLevel && headingLevel < level) {
      if (current) current.body = current.body.trim();
      current = undefined;
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) current.body = current.body.trim();
  return sections;
}

export function extractWikiLinks(markdown: string): WikiLink[] {
  const links: WikiLink[] = [];
  const pattern = /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g;
  for (const match of markdown.matchAll(pattern)) {
    const rawTarget = match[1]!.trim();
    const target = rawTarget.split("#", 1)[0]!.trim();
    if (!target) continue;
    links.push({
      raw: match[0],
      target: withoutExtension(target),
      label: (match[2] || rawTarget.split("#").at(-1) || target).trim(),
    });
  }
  return links;
}
