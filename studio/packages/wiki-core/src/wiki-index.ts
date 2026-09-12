import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import type { PageCategory, PageSection, VaultConfig, WikiLink, WikiPage, WikiPageSummary } from "@the-way-here/shared";
import { readExternalSource } from "./external-sources.js";
import { loadVaultConfig } from "./config.js";
import { toPosix, withoutExtension, categoryForPath, pageIdForPath } from "./page-paths.js";
import { stringArray, sourceImportChannel, dateValue, normalizeFrontmatterProperties, plainText, extractTitle, extractSections, extractWikiLinks } from "./markdown.js";

type InternalPage = WikiPageSummary & {
  fileMarkdown: string;
  rawMarkdown: string;
  properties: Record<string, unknown>;
  sections: PageSection[];
  outgoingLinks: WikiLink[];
};

export class WikiIndex {
  readonly vaultRoot: string;
  readonly knowledgeBaseId?: string;
  config!: VaultConfig;
  lastIndexedAt = "";
  private rebuildQueue: Promise<void> = Promise.resolve();
  private pages = new Map<string, InternalPage>();
  private lookup = new Map<string, string[]>();
  private originalLookup = new Map<string, string[]>();
  private incoming = new Map<string, Set<string>>();

  constructor(vaultRoot: string, knowledgeBaseId?: string) {
    this.vaultRoot = path.resolve(vaultRoot);
    this.knowledgeBaseId = knowledgeBaseId;
  }

  rebuild(): Promise<void> {
    const next = this.rebuildQueue.then(() => this.rebuildNow());
    this.rebuildQueue = next.catch(() => undefined);
    return next;
  }

  private async rebuildNow(): Promise<void> {
    this.config = await loadVaultConfig(this.vaultRoot, this.knowledgeBaseId);
    const patterns = [
      `${toPosix(this.config.paths.wiki)}/**/*.md`,
      `${toPosix(this.config.paths.sources)}/**/*.md`,
    ];
    const files = await fg(patterns, {
      cwd: this.vaultRoot,
      onlyFiles: true,
      unique: true,
      followSymbolicLinks: false,
    });

    const pages = new Map<string, InternalPage>();
    for (const relativeFile of files.sort()) {
      const relativePath = toPosix(relativeFile);
      const absolutePath = path.resolve(this.vaultRoot, relativePath);
      if (!absolutePath.startsWith(`${this.vaultRoot}${path.sep}`)) continue;
      const [referenceContent, fileStat] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
      const external = await readExternalSource(this.vaultRoot, this.config, relativePath, referenceContent);
      const content = external?.content ?? referenceContent;
      let parsedContent = content;
      let parsedData: Record<string, any> = {};
      try {
        const parsed = matter(content);
        parsedContent = parsed.content;
        parsedData = parsed.data;
      } catch {
        // Keep malformed files readable in the GUI; validators remain responsible
        // for reporting invalid frontmatter.
      }
      const id = pageIdForPath(relativePath, this.config);
      const body = parsedContent.trim();
      const isSource = !relativePath.startsWith(`${this.config.paths.wiki}/`);
      const title = external?.externalSource.originalPath ? path.basename(external.externalSource.originalPath).replace(/\.(md|txt)$/i, "") : isSource ? path.posix.basename(withoutExtension(relativePath)) : extractTitle(body, relativePath);
      pages.set(id, {
        id,
        externalSource: external?.externalSource,
        relativePath,
        title,
        category: categoryForPath(relativePath, this.config),
        type: parsedData.type ? String(parsedData.type) : undefined,
        importChannel: sourceImportChannel(parsedData.import_channel),
        aliases: stringArray(parsedData.aliases),
        tags: stringArray(parsedData.tags),
        status: parsedData.status ? String(parsedData.status) : undefined,
        start: dateValue(parsedData.Start ?? parsedData.start),
        end: dateValue(parsedData.end ?? parsedData.End),
        locations: stringArray(parsedData.location),
        sources: stringArray(parsedData.source),
        excerpt: plainText(body.replace(/^#\s+.+$/m, "")).slice(0, 260),
        modifiedAt: fileStat.mtime.toISOString(),
        isSource,
        fileMarkdown: content,
        rawMarkdown: body,
        properties: normalizeFrontmatterProperties(parsedData),
        sections: extractSections(body),
        outgoingLinks: extractWikiLinks(body),
      });
    }

    this.pages = pages;
    this.rebuildLookups();
    this.lastIndexedAt = new Date().toISOString();
  }

  private rebuildLookups(): void {
    this.lookup.clear();
    this.originalLookup.clear();
    this.incoming.clear();
    for (const page of this.pages.values()) {
      if (page.externalSource?.originalPath) {
        const key = page.externalSource.originalPath.replace(/\.(md|txt)$/i, "").toLocaleLowerCase();
        this.originalLookup.set(key, [...(this.originalLookup.get(key) || []), page.id]);
      }
      for (const key of [page.id, withoutExtension(page.relativePath), path.posix.basename(page.id), page.title, ...page.aliases]) {
        const normalized = key.trim().toLocaleLowerCase();
        if (!normalized) continue;
        const matches = this.lookup.get(normalized) || [];
        if (!matches.includes(page.id)) matches.push(page.id);
        this.lookup.set(normalized, matches);
      }
    }
    for (const page of this.pages.values()) {
      page.outgoingLinks = page.outgoingLinks.map((link) => {
        const candidates = this.linkCandidates(page, link.target);
        const resolvedId = candidates.length === 1 ? candidates[0] : undefined;
        if (resolvedId) {
          const incoming = this.incoming.get(resolvedId) || new Set<string>();
          incoming.add(page.id);
          this.incoming.set(resolvedId, incoming);
        }
        return { ...link, resolvedId, ambiguous: candidates.length > 1 };
      });
    }
  }

  private linkCandidates(page: InternalPage, target: string): string[] {
    const normalized = withoutExtension(toPosix(target.trim()));
    if (!normalized) return [page.id];
    if (page.externalSource?.originalPath && !/^(wiki|sources?|原始知识库|app|vault)\//.test(normalized)) {
      const originalTarget = path.resolve(path.dirname(page.externalSource.originalPath), normalized).replace(/\.(md|txt)$/i, "").toLocaleLowerCase();
      const original = this.originalLookup.get(originalTarget);
      if (original?.length) return original;
    }
    if (normalized.startsWith(".")) {
      const relative = path.posix.normalize(path.posix.join(path.posix.dirname(page.relativePath), normalized));
      return this.lookup.get(relative.toLocaleLowerCase()) || [];
    }
    return this.lookup.get(normalized.toLocaleLowerCase()) || [];
  }

  list(options: { category?: PageCategory; sources?: boolean } = {}): WikiPageSummary[] {
    return [...this.pages.values()]
      .filter((page) => (options.category ? page.category === options.category : true))
      .filter((page) => (options.sources === undefined ? true : page.isSource === options.sources))
      .map(this.summary)
      .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
  }

  get(id: string): WikiPage | undefined {
    const normalized = withoutExtension(toPosix(id).replace(/^\/+/, ""));
    const page = this.pages.get(normalized);
    if (!page) return undefined;
    const incomingLinks = [...(this.incoming.get(page.id) || [])]
      .map((sourceId) => this.pages.get(sourceId))
      .filter((value): value is InternalPage => Boolean(value))
      .map(this.summary);
    const relatedPages = [...new Set(page.outgoingLinks.map((link) => link.resolvedId).filter((value): value is string => Boolean(value)))]
      .map((relatedId) => this.pages.get(relatedId))
      .filter((value): value is InternalPage => Boolean(value))
      .map(this.summary);
    const renderedMarkdown = page.rawMarkdown.replace(
      /\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
      (_raw, rawTarget: string, rawLabel?: string) => {
        const target = rawTarget.split("#", 1)[0]!.trim();
        const label = (rawLabel || rawTarget.split("#").at(-1) || target).trim();
        const candidates = this.linkCandidates(page, target);
        if (candidates.length !== 1) return label;
        const href = candidates[0]!.split("/").map(encodeURIComponent).join("/");
        const fragment = rawTarget.includes("#") ? `#${encodeURIComponent(rawTarget.slice(rawTarget.indexOf("#") + 1).trim())}` : "";
        return `[${label}](/page/${href}${fragment})`;
      },
    );
    return {
      ...this.summary(page),
      markdown: page.fileMarkdown,
      renderedMarkdown,
      properties: page.properties,
      sections: page.sections,
      outgoingLinks: page.outgoingLinks,
      relatedPages,
      incomingLinks,
    };
  }

  search(query: string, limit = 30): WikiPageSummary[] {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return [...this.pages.values()]
      .map((page) => {
        const title = `${page.title} ${page.aliases.join(" ")}`.toLocaleLowerCase();
        const body = `${page.rawMarkdown} ${page.tags.join(" ")}`.toLocaleLowerCase();
        const score = terms.reduce((total, term) => {
          if (title.includes(term)) total += 8;
          if (body.includes(term)) total += 2;
          return total;
        }, 0);
        return { page, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.page.modifiedAt.localeCompare(a.page.modifiedAt))
      .slice(0, limit)
      .map(({ page }) => this.summary(page));
  }

  categoryCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const page of this.pages.values()) counts[page.category] = (counts[page.category] || 0) + 1;
    return counts;
  }

  private summary = (page: InternalPage): WikiPageSummary => ({
    id: page.id,
    externalSource: page.externalSource,
    relativePath: page.relativePath,
    title: page.title,
    category: page.category,
    type: page.type,
    importChannel: page.importChannel,
    aliases: page.aliases,
    tags: page.tags,
    status: page.status,
    start: page.start,
    end: page.end,
    locations: page.locations,
    sources: page.sources,
    excerpt: page.excerpt,
    modifiedAt: page.modifiedAt,
    isSource: page.isSource,
  });
}
