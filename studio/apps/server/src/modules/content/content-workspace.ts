import type { WikiIndex } from "@the-way-here/wiki-core";

/** Content access supplied by the server; no dependency on watching or switching libraries. */
export interface ContentWorkspace {
  readonly vaultRoot: string;
  readonly index: WikiIndex;
  readonly events: { broadcast(event: string, data: unknown): void };
}
