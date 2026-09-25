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

describe("outside pointer dismissal", () => {
  it("closes nested floating windows outside both, but keeps the parent when clicked inside it", () => {
    const stack = new DismissLayerStack();
    const panel = {} as HTMLElement;
    const preview = {} as HTMLElement;
    const outside = {} as EventTarget;
    const closePanel = vi.fn(), closePreview = vi.fn();
    stack.add({ close: closePanel, canClose: () => true, priority: 0, element: () => panel, outside: true });
    stack.add({ close: closePreview, canClose: () => true, priority: 2, element: () => preview, outside: true });
    stack.handlePointer(Object.assign(new Event("pointerdown"), { composedPath: () => [panel] }) as unknown as PointerEvent);
    expect(closePreview).toHaveBeenCalledOnce();
    expect(closePanel).not.toHaveBeenCalled();
    stack.handlePointer(Object.assign(new Event("pointerdown"), { composedPath: () => [outside] }) as unknown as PointerEvent);
    expect(closePanel).toHaveBeenCalledOnce();
  });
  it("keeps menu-owned windows for a later return and ignores their toggle", () => {
    const stack = new DismissLayerStack();
    const panel = {} as HTMLElement;
    const trigger = {} as HTMLElement;
    const menu = { matches: () => true } as unknown as HTMLElement;
    const close = vi.fn();
    stack.add({ close, canClose: () => true, priority: 0, element: () => panel, outside: true, ignore: () => trigger });
    stack.handlePointer(Object.assign(new Event("pointerdown"), { composedPath: () => [trigger] }) as unknown as PointerEvent);
    stack.handlePointer(Object.assign(new Event("pointerdown"), { composedPath: () => [menu] }) as unknown as PointerEvent);
    expect(close).not.toHaveBeenCalled();
  });
});
