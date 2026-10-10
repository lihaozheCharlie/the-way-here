/** Source positions connect rendered Markdown blocks to the plain-text editor. */
export function lineOffset(text: string, line: number): number {
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const next = text.indexOf("\n", offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return offset;
}

export function offsetLine(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

export function documentScrollContainer(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
}

export function alignDocumentPosition(element: HTMLElement, localTop: number, viewportTop: number) {
  const container = documentScrollContainer(element);
  const delta = element.getBoundingClientRect().top + localTop - viewportTop;
  if (container) container.scrollTop += delta;
  else window.scrollBy({ top: delta, behavior: "auto" });
}

/** Measure soft wraps using the editor's actual font and width, including CJK text. */
export function editorOffsetTop(editor: HTMLTextAreaElement, offset: number): number {
  const mirror = document.createElement("div");
  const style = getComputedStyle(editor);
  for (const property of ["font", "letter-spacing", "line-height", "padding", "border", "box-sizing", "tab-size", "word-break", "overflow-wrap"]) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(mirror.style, { position: "fixed", visibility: "hidden", width: `${editor.getBoundingClientRect().width}px`, whiteSpace: "pre-wrap", overflowWrap: "break-word", top: "0", left: "0" });
  mirror.textContent = editor.value.slice(0, offset);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  const top = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
  mirror.remove();
  return top;
}
