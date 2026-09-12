import { describe, expect, it } from "vitest";
import { CodexAppServer } from "@the-way-here/codex-bridge";

describe("Codex process failures", () => {
  it("rejects missing executables without crashing the server and permits retry", async () => {
    const bridge = new CodexAppServer('/nonexistent/twh-codex');
    await expect(bridge.start()).rejects.toThrow('ENOENT');
    await expect(bridge.start()).rejects.toThrow('ENOENT');
    bridge.stop();
  });
});
