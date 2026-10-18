import type { WikiIndex } from "@the-way-here/wiki-core";

/** Content access supplied by the server; no dependency on watching or switching libraries. */
export interface ContentWorkspace {
  refreshSources?: (knowledgeBaseId?: string) => Promise<void>;
  readonly vaultRoot: string;
  readonly index: WikiIndex;
  readonly events: { broadcast(event: string, data: unknown): void };
}

/** Freeze the active index before a queued mutation can outlive a library switch. */
export function bindContentWorkspace(workspace: ContentWorkspace): ContentWorkspace {
  return {
    vaultRoot: workspace.vaultRoot,
    index: workspace.index,
    events: workspace.events,
    refreshSources: workspace.refreshSources,
  };
}
