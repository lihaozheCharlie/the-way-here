import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

type TabOption<T extends string> = { value: T; label: string };
type SegmentedTabsProps<T extends string> = {
  label: string;
  value: T;
  options: readonly TabOption<T>[];
  onChange: (value: T) => void;
  className?: string;
};

export function SegmentedTabs<T extends string>({ label, value, options, onChange, className = "" }: SegmentedTabsProps<T>) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const element = root.current;
      const button = element?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!element || !button) return;
      element.style.setProperty("--tab-x", `${button.offsetLeft}px`);
      element.style.setProperty("--tab-width", `${button.offsetWidth}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [value, options]);

  function navigateTabs(event: KeyboardEvent<HTMLDivElement>) {
    if (!options.length || event.altKey || event.ctrlKey || event.metaKey) return;
    const current = Math.max(0, options.findIndex(option => option.value === value));
    let index: number;
    switch (event.key) {
      case "ArrowRight": index = (current + 1) % options.length; break;
      case "ArrowLeft": index = (current - 1 + options.length) % options.length; break;
      case "Home": index = 0; break;
      case "End": index = options.length - 1; break;
      default: return;
    }
    event.preventDefault();
    onChange(options[index]!.value);
    root.current?.querySelectorAll<HTMLButtonElement>("button")[index]?.focus();
  }

  return <div ref={root} className={`tabbar segmented-tabs ${className}`} role="tablist"
    aria-label={label} onKeyDown={navigateTabs}>
    {options.map(option => <button type="button" role="tab" key={option.value}
      tabIndex={option.value === value ? 0 : -1} aria-selected={option.value === value}
      onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}
