import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api request headers", () => {
  it("does not describe a bodyless DELETE as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await api("/api/vault/personal", { method: "DELETE" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("adds the JSON content type when a request has a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await api("/api/vault/select", { method: "POST", body: JSON.stringify({ knowledgeBaseId: "personal" }) });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });
});

it("reopens model setup when a model action has no usable runtime", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Codex 当前不可用，请先完成全局 AI 设置" }), { status: 500 })));
  const browserWindow = new EventTarget();
  const required = vi.fn();
  browserWindow.addEventListener("model-configuration-required", required);
  vi.stubGlobal("window", browserWindow);

  await expect(api("/api/runs", { method: "POST" })).rejects.toThrow("请先完成全局 AI 设置");
  expect(required).toHaveBeenCalledOnce();
});
