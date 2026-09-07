import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./truncated-text-tooltip.css";

type OverflowMetrics = {
  clientHeight: number;
  clientWidth: number;
  lineClamp: string;
  scrollHeight: number;
  scrollWidth: number;
  textOverflow: string;
};

type ActiveTooltip = {
  anchor: HTMLElement;
  origin: "focus" | "pointer";
  rect: DOMRect;
  text: string;
};

export function isTruncatedText(metrics: OverflowMetrics): boolean {
  const hasEllipsis = metrics.textOverflow === "ellipsis";
  const clamp = Number.parseInt(metrics.lineClamp, 10);
  const hasLineClamp = Number.isFinite(clamp) && clamp > 0;
  if (!hasEllipsis && !hasLineClamp) return false;
  return hasEllipsis && metrics.scrollWidth > metrics.clientWidth + 1
    || hasLineClamp && metrics.scrollHeight > metrics.clientHeight + 1;
}

function hasDedicatedTooltip(element: HTMLElement): boolean {
  if (element.closest('[role="tooltip"], [data-overflow-tooltip="off"]')) return true;
  let owner: HTMLElement | null = element;
  while (owner) {
    const descriptionIds = owner.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) || [];
    if (descriptionIds.some((id) => document.getElementById(id)?.getAttribute("role") === "tooltip")) return true;
    owner = owner.parentElement;
  }
  return false;
}

function overflowText(element: HTMLElement): string {
  return (element.dataset.fullText || element.textContent || "").replace(/\s+/g, " ").trim();
}

function isOverflowElement(element: HTMLElement): boolean {
  if (element.matches("input, textarea, select, option") || element.isContentEditable || element.getAttribute("aria-hidden") === "true") return false;
  if (hasDedicatedTooltip(element) || !overflowText(element) || !element.getClientRects().length) return false;
  const style = window.getComputedStyle(element);
  return isTruncatedText({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    lineClamp: style.webkitLineClamp,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
    textOverflow: style.textOverflow,
  });
}

function findInPath(path: EventTarget[]): HTMLElement | undefined {
  return path.find((target): target is HTMLElement => target instanceof HTMLElement && isOverflowElement(target));
}

function findInFocusable(element: HTMLElement): HTMLElement | undefined {
  if (isOverflowElement(element)) return element;
  return [...element.querySelectorAll<HTMLElement>("*")].find(isOverflowElement);
}

function tooltipPosition(anchor: DOMRect, tooltip: DOMRect): { left: number; top: number } {
  const viewportMargin = 12;
  const anchorGap = 8;
  const centeredLeft = anchor.left + anchor.width / 2 - tooltip.width / 2;
  const left = Math.min(Math.max(centeredLeft, viewportMargin), Math.max(viewportMargin, window.innerWidth - tooltip.width - viewportMargin));
  const below = anchor.bottom + anchorGap;
  const above = anchor.top - tooltip.height - anchorGap;
  const top = below + tooltip.height <= window.innerHeight - viewportMargin
    ? below
    : Math.max(viewportMargin, above);
  return { left, top };
}

export function TruncatedTextTooltip() {
  const tooltipId = useId().replace(/:/g, "");
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<ActiveTooltip>();
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    const show = (anchor: HTMLElement, origin: ActiveTooltip["origin"]) => {
      setActive({ anchor, origin, rect: anchor.getBoundingClientRect(), text: overflowText(anchor) });
    };
    const hide = () => setActive(undefined);
    const handlePointerOver = (event: PointerEvent) => {
      const anchor = findInPath(event.composedPath());
      if (anchor) show(anchor, "pointer");
    };
    const handlePointerOut = (event: PointerEvent) => {
      setActive((current) => {
        if (!current || current.origin !== "pointer") return current;
        if (event.relatedTarget instanceof Node && current.anchor.contains(event.relatedTarget)) return current;
        if (event.relatedTarget instanceof Element && event.relatedTarget.closest(`#${tooltipId}`)) return current;
        return undefined;
      });
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const anchor = findInFocusable(event.target);
      if (anchor) show(anchor, "focus");
    };
    const handleFocusOut = () => {
      setActive((current) => current?.origin === "focus" ? undefined : current);
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [tooltipId]);

  useEffect(() => {
    if (!active) return;
    const previous = active.anchor.getAttribute("aria-describedby");
    const ids = new Set(previous?.split(/\s+/).filter(Boolean) || []);
    ids.add(tooltipId);
    active.anchor.setAttribute("aria-describedby", [...ids].join(" "));
    return () => {
      if (previous === null) active.anchor.removeAttribute("aria-describedby");
      else active.anchor.setAttribute("aria-describedby", previous);
    };
  }, [active, tooltipId]);

  useLayoutEffect(() => {
    if (!active || !tooltipRef.current) return;
    setPosition(tooltipPosition(active.rect, tooltipRef.current.getBoundingClientRect()));
  }, [active]);

  if (!active) return null;
  return createPortal(
    <div
      className="truncated-text-tooltip"
      id={tooltipId}
      ref={tooltipRef}
      role="tooltip"
      style={{ left: position.left, top: position.top }}
    >{active.text}</div>,
    document.body,
  );
}
