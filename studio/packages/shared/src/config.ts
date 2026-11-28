import { type AgentRuntimeConfig, type AgentRuntimeDescriptor } from "./agents.js";

export const EXTERNAL_SOURCE_FOLDER = "外部来源";

export interface SourceConnection {
  id: string;
  name: string;
  path: string;
  autoBuild: boolean;
  aiWritable?: boolean;
}

export interface VaultConfig {
  sourceConnections?: SourceConnection[];
  version: number;
  name: string;
  knowledgeBaseId: string;
  knowledgeBases: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  adapter: string;
  /**
   * Content layer root. `paths.wiki` / `paths.sources` (and the derived
   * predictions directory) resolve against this root; when absent they
   * resolve against the workspace root. App resources such as
   * `paths.skills` always stay inside the workspace.
   */
  storage?: { contentRoot: string };
  paths: {
    wiki: string;
    sources: string;
    skills: string;
    tools: string;
    agentInstructions: string;
  };
  views: Record<string, boolean>;
  agents: AgentRuntimeConfig;
  validation: {
    commands: string[][];
  };
}

export interface VaultInfo {
  /** First known AI interaction, persisted per personal space. */
  companionshipStartedAt?: string;
  name: string;
  root: string;
  knowledgeBaseId: string;
  knowledgeBases: VaultConfig["knowledgeBases"];
  adapter: string;
  pageCount: number;
  sourceCount: number;
  lastIndexedAt: string;
  categories: Record<string, number>;
  agentAvailable: boolean;
  runtimes: AgentRuntimeDescriptor[];
}
