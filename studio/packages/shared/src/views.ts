import { type PageCategory, type WikiLink, type PageSection, type WikiPageSummary, type WikiPage } from "./content.js";
import { type PersonPhoto } from "./photos.js";

export interface StateSignal {
  id: string;
  name: string;
  kind: string;
  judgment: string;
  observation: string;
  links: WikiLink[];
  score?: number;
  reason?: string;
}

export interface ConversationPrompt {
  id: string;
  title: string;
  question: string;
  currentUnderstanding: string;
  reason: string;
  unknown: string;
  observation?: string;
  links: WikiLink[];
  status: "active" | "paused" | "archived";
  weight: number;
}

export interface TodayView {
  currentStage?: WikiPageSummary;
  currentStages: Array<{
    page: WikiPageSummary;
    range: string;
    focus: string;
    lane: number;
  }>;
  latestLetter?: WikiPageSummary;
  latestEvent?: WikiPageSummary;
  stateSignals: StateSignal[];
  focusCandidates: StateSignal[];
  conversationPrompts: ConversationPrompt[];
  focusPages: WikiPageSummary[];
  recentPages: WikiPageSummary[];
  guidingQuestion?: string;
}

export interface FocusEvidenceEvent {
  date: string;
  label: string;
  excerpt: string;
  kind: "source" | "letter" | "event" | "wiki";
  page: WikiPageSummary;
}

export interface FocusWorkspaceView {
  signal: StateSignal;
  candidates: StateSignal[];
  related: Array<{
    category: PageCategory;
    label: string;
    pages: WikiPageSummary[];
  }>;
  evidenceTimeline: FocusEvidenceEvent[];
  graph: GraphData;
}

export interface TimelineItem {
  id: string;
  title: string;
  kind: "stage" | "event";
  start?: string;
  end?: string;
  excerpt: string;
}

export interface LifeStageView {
  page: WikiPageSummary;
  range: string;
  focus: string;
  lane: number;
  order: number;
  current: boolean;
  representative?: WikiPageSummary;
  relatedEvents: WikiPageSummary[];
  relatedPeople: WikiPageSummary[];
  relatedPlaces: WikiPageSummary[];
  relatedSystems: WikiPageSummary[];
  relatedLetters: WikiPageSummary[];
}

export interface LifeMapView {
  overview?: WikiPageSummary;
  stages: LifeStageView[];
  events: WikiPageSummary[];
}

export interface StructuredCard {
  id: string;
  title: string;
  excerpt: string;
  updatedAt?: string;
  sections: Array<{ heading: string; body: string }>;
}

export interface PersonGroup {
  name: string;
  people: PersonInsight[];
}

export interface PersonInsight extends WikiPageSummary {
  avatarUrl?: string;
  photos?: PersonPhoto[];
  mentionCount: number;
  lastMention?: string;
  relatedStages: WikiPageSummary[];
  relatedRoles: WikiPageSummary[];
  relatedSystems: WikiPageSummary[];
}

export interface RelationshipsView {
  roles: StructuredCard[];
  groups: PersonGroup[];
  totalPeople: number;
}

export interface SectionedPageView {
  page: WikiPage;
  sections: PageSection[];
}

export interface QuoteEntry {
  title: string;
  quote: string;
  source: string;
  identity: string;
  usage: string;
  confirmed: boolean;
}

export interface QuoteGroup {
  title: string;
  entries: QuoteEntry[];
}

export interface QuotesView {
  page: WikiPage;
  groups: QuoteGroup[];
}

export interface GraphData {
  focusId?: string;
  nodes: Array<{ id: string; title: string; category: PageCategory; degree?: number; distance?: number }>;
  links: Array<{ source: string; target: string }>;
}

export interface LetterViewItem {
  page: WikiPageSummary;
  letterDate: string;
  evidenceFrom?: string;
  evidenceTo?: string;
  themes: WikiPageSummary[];
}

export interface LetterThread {
  id: string;
  title: string;
  category: PageCategory | "uncategorized";
  letters: string[];
  latestDate: string;
}

export interface LettersView {
  letters: LetterViewItem[];
  threads: LetterThread[];
  years: string[];
}
