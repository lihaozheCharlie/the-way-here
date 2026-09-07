

export type PageCategory =
  | "home"
  | "personal-lines"
  | "life-stages"
  | "events"
  | "cycles"
  | "relationship-roles"
  | "systems"
  | "entities"
  | "sources"
  | "mental-models"
  | "state"
  | "letters"
  | "quotes"
  | "maintenance"
  | "other";

export interface WikiLink {
  raw: string;
  target: string;
  label: string;
  resolvedId?: string;
  ambiguous?: boolean;
}

export interface PageSection {
  level: number;
  heading: string;
  body: string;
}

export interface WikiPageSummary {
  id: string;
  relativePath: string;
  title: string;
  category: PageCategory;
  type?: string;
  importChannel?: SourceImportChannel;
  aliases: string[];
  tags: string[];
  status?: string;
  start?: string;
  end?: string;
  locations: string[];
  sources: string[];
  excerpt: string;
  modifiedAt: string;
  isSource: boolean;
}

export interface WikiPage extends WikiPageSummary {
  markdown: string;
  renderedMarkdown: string;
  properties: Record<string, unknown>;
  sections: PageSection[];
  outgoingLinks: WikiLink[];
  relatedPages?: WikiPageSummary[];
  incomingLinks: WikiPageSummary[];
}

export interface SourceFolderSummary {
  /** Slash-separated path relative to the current knowledge base's source root. */
  path: string;
}

export type SourceChatImportChannel = "chatgpt" | "claude" | "gemini" | "deepseek" | "doubao" | "other-ai";

export type SourceImportChannel = "files" | SourceChatImportChannel | "alipay" | "photos";
