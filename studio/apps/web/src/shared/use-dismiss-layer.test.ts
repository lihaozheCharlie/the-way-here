import { describe, expect, it, vi } from "vitest";
import { DismissLayerStack } from "./use-dismiss-layer";

function escape(options = {}) {
  return Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape", repeat: false, isComposing: false }, options) as KeyboardEvent;
}

describe("shared Escape dismissal", () => {
  it("closes one upper layer then the floating panel on separate presses", () => {
    const stack = new DismissLayerStack();
    const panel = vi.fn(), dialog = vi.fn();
    stack.add({ close: panel, canClose: () => true, priority: 0 });
    const remove = stack.add({ close: dialog, canClose: () => true, priority: 2 });
    stack.handle(escape());
    expect(dialog).toHaveBeenCalledOnce();
    expect(panel).not.toHaveBeenCalled();
    remove();
    stack.handle(escape());
    expect(panel).toHaveBeenCalledOnce();
  });
  it("preserves a busy dialog and everything below it", () => {
    const stack = new DismissLayerStack(), close = vi.fn();
    stack.add({ close, canClose: () => true, priority: 0 });
    stack.add({ close, canClose: () => false, priority: 2 });
    const event = escape();
    stack.handle(event);
    expect(event.defaultPrevented).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });
  it("ignores composition, held keys and already handled Escape", () => {
    const stack = new DismissLayerStack(), close = vi.fn();
    stack.add({ close, canClose: () => true, priority: 0 });
    stack.handle(escape({ isComposing: true }));
    stack.handle(escape({ repeat: true }));
    const event = escape(); event.preventDefault(); stack.handle(event);
    expect(close).not.toHaveBeenCalled();
  });
  it("uses opening order within a layer and removes stale registrations", () => {
    const stack = new DismissLayerStack(), first = vi.fn(), second = vi.fn();
    const removeFirst = stack.add({ close: first, canClose: () => true, priority: 1 });
    const removeSecond = stack.add({ close: second, canClose: () => true, priority: 1 });
    stack.handle(escape());
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    removeFirst(); removeSecond();
    const event = escape(); stack.handle(event);
    expect(event.defaultPrevented).toBe(false);
  });
  it("leaves native dialog cancellation alone unless a child layer owns Escape", () => {
    const stack = new DismissLayerStack(), outer = vi.fn(), inner = vi.fn();
    const child = {} as HTMLElement;
    const modal = { contains: (element: unknown) => element === child } as Element;
    stack.add({ close: outer, canClose: () => true, priority: 0 });
    const event = escape(); stack.handle(event, modal);
    expect(event.defaultPrevented).toBe(false);
    expect(outer).not.toHaveBeenCalled();
    stack.add({ close: inner, canClose: () => true, priority: 2, element: () => child });
    stack.handle(escape(), modal);
    expect(inner).toHaveBeenCalledOnce();
    expect(outer).not.toHaveBeenCalled();
  });
});
