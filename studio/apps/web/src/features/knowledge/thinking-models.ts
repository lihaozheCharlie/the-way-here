import { tr } from "../../shared/i18n";
import type { SectionedPageView, StructuredCard } from "@the-way-here/shared";

export type ThinkingModel = {
  key: string;
  pageId: string;
  title: string;
  body: string;
  excerpt?: string;
  sections: Array<{ heading: string; body: string }>;
};

const numberedHeading = /^[一二三四五六七八九十]+、/;

function fromCard(card: StructuredCard): ThinkingModel {
  return {
    key: card.id,
    pageId: card.id,
    title: card.title,
    excerpt: card.excerpt,
    sections: card.sections,
    body: card.sections.map((section) => `${section.heading}\n${section.body}`).join("\n\n"),
  };
}

/** Prefer one page per model. Older vaults keep a single overview whose sections are numbered 一、二、三. */
export function resolveThinkingModels(cards: StructuredCard[] | undefined, legacy: SectionedPageView | undefined): ThinkingModel[] {
  const pages = (cards || []).filter((card) => !card.id.includes("总览") && !card.title.includes("总览") && card.sections.length > 0);
  if (pages.some((card) => card.sections.some((section) => section.heading === "模型定义"))) return pages.map(fromCard);
  const numbered = (legacy?.sections || []).filter((section) => numberedHeading.test(section.heading));
  if (legacy && numbered.length) {
    return numbered.map((section) => ({
      key: section.heading,
      pageId: legacy.page.id,
      title: section.heading.replace(numberedHeading, ""),
      sections: [{ heading: tr("模型说明"), body: section.body }],
      body: section.body,
    }));
  }
  return pages.map(fromCard);
}
