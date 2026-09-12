import { type AgentRuntimeConfig, type AgentRuntimeDescriptor } from "./agents.js";

export const EXTERNAL_SOURCE_FOLDER = "外部来源";

export interface SourceConnection {
  id: string;
  name: string;
  path: string;
  autoBuild: boolean;
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
