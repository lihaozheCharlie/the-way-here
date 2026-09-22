import { useEffect, useRef, type RefObject } from "react";

type Layer = { close: () => void; canClose: () => boolean; priority: number; element?: () => HTMLElement | null };

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
    if (!event.repeat && top.canClose()) top.close();
  }
}

const stack = new DismissLayerStack();
let subscribers = 0;
function handleEscape(event: KeyboardEvent) {
  // Native modal dialogs occupy the browser top layer and own their cancel event.
  stack.handle(event, document.activeElement?.closest("dialog:modal") || [...document.querySelectorAll("dialog:modal")].at(-1));
}

/** Shared by floating panels, popovers and custom dialogs. Native dialogs use onCancel.
 * Busy layers remain registered so Escape cannot dismiss a window underneath them.
 * Element handlers may preventDefault/stopPropagation to consume Escape locally.
 */
export function useDismissLayer(open: boolean, onClose: () => void, { dismissible = true, priority = 1, element }: { dismissible?: boolean; priority?: number; element?: RefObject<HTMLElement | null> } = {}) {
  const latest = useRef({ onClose, dismissible });
  latest.current = { onClose, dismissible };
  useEffect(() => {
    if (!open) return;
    const remove = stack.add({ close: () => latest.current.onClose(), canClose: () => latest.current.dismissible, priority, element: element ? () => element.current : undefined });
    if (subscribers++ === 0) window.addEventListener("keydown", handleEscape);
    return () => {
      remove();
      if (--subscribers === 0) window.removeEventListener("keydown", handleEscape);
    };
  }, [open, priority, element]);
}
