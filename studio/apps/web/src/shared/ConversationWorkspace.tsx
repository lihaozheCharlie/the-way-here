import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keep the primary input on screen while long context and evidence scroll inside. */
export function ConversationWorkspace({ children, id }: { children: ReactNode; id?: string }) {
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const main = element.closest(".main-area");
      const top = element.getBoundingClientRect().top + (main?.scrollTop || 0);
      const height = `${Math.max(340, Math.min(680, window.innerHeight - top - 24))}px`;
      if (element.style.getPropertyValue("--conversation-height") !== height) {
        element.style.setProperty("--conversation-height", height);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (element.parentElement) observer.observe(element.parentElement);
    // Onboarding and other asynchronously loaded siblings can move this workspace
    // without resizing its immediate parent. Track their containing frame too.
    const frame = element.closest(".page-frame");
    if (frame) observer.observe(frame);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  return <section ref={root} id={id} className="focus-conversation-grid" aria-label="当前话题与证据">{children}</section>;
}
