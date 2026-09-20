import { afterEach, expect, it, vi } from "vitest";
import { subscribeLiveRevision } from "./live-revision";

afterEach(() => vi.unstubAllGlobals());

it("recovers missed completion on reconnect and returning to the page, and cleans up", () => {
  const stream = Object.assign(new EventTarget(), { close: vi.fn() });
  vi.stubGlobal("EventSource", vi.fn(function () { return stream; }));
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: "hidden" });
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  const refresh = vi.fn();
  const dispose = subscribeLiveRevision(refresh);
  stream.dispatchEvent(new Event("open"));
  stream.dispatchEvent(new Event("run"));
  stream.dispatchEvent(new Event("open"));
  expect(refresh).toHaveBeenCalledTimes(3);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(refresh).toHaveBeenCalledTimes(3);
  document.visibilityState = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus"));
  stream.dispatchEvent(new Event("import"));
  expect(refresh).toHaveBeenCalledTimes(6);
  dispose();
  expect(stream.close).toHaveBeenCalledOnce();
  document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus"));
  expect(refresh).toHaveBeenCalledTimes(6);
});
