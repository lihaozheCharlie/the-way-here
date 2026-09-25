import { useEffect, useRef, type RefObject } from "react";

type DismissReason = "escape" | "outside";
type Layer = { close: (reason: DismissReason) => void; canClose: () => boolean; priority: number; element?: () => HTMLElement | null; outside?: boolean; ignore?: () => HTMLElement | null };

/** One Escape belongs to one layer, including when that layer is busy. */
export class DismissLayerStack {
  private layers: Layer[] = [];
  add(layer: Layer) {
    this.layers.push(layer);
    return () => { this.layers = this.layers.filter(item => item !== layer); };
  }
  handle(event: KeyboardEvent, nativeModal?: Element | null) {
    if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
    const eligible = nativeModal ? this.layers.filter(layer => {
      const element = layer.element?.();
      return element && nativeModal.contains(element);
    }) : this.layers;
    const top = eligible.reduce<Layer | undefined>((current, layer) => !current || layer.priority >= current.priority ? layer : current, undefined);
    if (!top) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat && top.canClose()) top.close("escape");
  }
  handlePointer(event: PointerEvent, nativeModal?: Element | null) {
    if (nativeModal) return;
    const path = event.composedPath();
    // Navigation changes which menu owns a floating window. Keep that menu's
    // open state so returning to it can restore the window.
    if (path.some(item => typeof (item as Element).matches === "function" && (item as Element).matches("#main-navigation, #main-navigation *"))) return;
    const containing = [...this.layers].reverse().find(layer => {
      const element = layer.element?.();
      return element && path.includes(element);
    });
    for (const layer of [...this.layers].reverse()) {
      if (layer === containing) break;
      if (!layer.outside || !layer.canClose()) continue;
      const ignored = layer.ignore?.();
      if (!ignored || !path.includes(ignored)) layer.close("outside");
    }
  }
}

const stack = new DismissLayerStack();
let subscribers = 0;
function handleEscape(event: KeyboardEvent) {
  // Native modal dialogs occupy the browser top layer and own their cancel event.
  stack.handle(event, document.activeElement?.closest("dialog:modal") || [...document.querySelectorAll("dialog:modal")].at(-1));
}
function handlePointer(event: PointerEvent) {
  stack.handlePointer(event, document.querySelector("dialog:modal"));
}

/** Shared by floating panels, popovers and custom dialogs. Native dialogs use onCancel.
 * Busy layers remain registered so Escape cannot dismiss a window underneath them.
 * Element handlers may preventDefault/stopPropagation to consume Escape locally.
 */
export function useDismissLayer(open: boolean, onClose: (reason: DismissReason) => void, { dismissible = true, priority = 1, element, outside = false, ignore }: { dismissible?: boolean; priority?: number; element?: RefObject<HTMLElement | null>; outside?: boolean; ignore?: RefObject<HTMLElement | null> } = {}) {
  const latest = useRef({ onClose, dismissible });
  latest.current = { onClose, dismissible };
  useEffect(() => {
    if (!open) return;
    const remove = stack.add({ close: reason => latest.current.onClose(reason), canClose: () => latest.current.dismissible, priority, element: element ? () => element.current : undefined, outside, ignore: ignore ? () => ignore.current : undefined });
    if (subscribers++ === 0) { window.addEventListener("keydown", handleEscape); window.addEventListener("pointerdown", handlePointer, true); }
    return () => {
      remove();
      if (--subscribers === 0) { window.removeEventListener("keydown", handleEscape); window.removeEventListener("pointerdown", handlePointer, true); }
    };
  }, [open, priority, element, outside, ignore]);
}
