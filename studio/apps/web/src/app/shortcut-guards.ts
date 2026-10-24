type ShortcutTarget = {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
  closest?: (selector: string) => unknown;
};

function isEditableTarget(target: ShortcutTarget | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !["button", "checkbox", "radio", "file", "submit", "reset", "range", "color"].includes(target.type || "text");
  return false;
}

/** Capture uses Cmd/Ctrl+Enter to save. Knowledge-base numbers must not fire while typing. */
export function shortcutSuppressed(action: string, target: EventTarget | null): boolean {
  const node = target as ShortcutTarget | null;
  if (action.startsWith("knowledge-base:") && isEditableTarget(node)) return true;
  if (action === "detach" && node?.closest?.(".life-record-capture")) return true;
  return false;
}
