import { type AgentRuntimeConfig, type AgentRuntimeDescriptor } from "./agents.js";

export interface VaultConfig {
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
