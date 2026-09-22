import { useEffect, useRef, type HTMLAttributes, type UIEvent } from "react";
import "./pane-shelf.css";

export function useQuietScroll() {
  const timers = useRef(new Map<HTMLElement, ReturnType<typeof setTimeout>>());
  useEffect(() => () => { timers.current.forEach((timer, element) => { clearTimeout(timer); delete element.dataset.scrolling; }); timers.current.clear(); }, []);
  return (event: UIEvent<HTMLElement>) => {
    const element = event.target as HTMLElement;
    if (!element.matches('.quiet-scroll, .collapsible-index-content > aside')) return;
    clearTimeout(timers.current.get(element));
    element.dataset.scrolling = "true";
    timers.current.set(element, setTimeout(() => { delete element.dataset.scrolling; timers.current.delete(element); }, 800));
  };
}

export function QuietScroll({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  const onScroll = useQuietScroll();
  return <div {...props} className={`quiet-scroll ${className}`} onScroll={onScroll} />;
}
