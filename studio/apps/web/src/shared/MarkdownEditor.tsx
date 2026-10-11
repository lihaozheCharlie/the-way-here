import { useLayoutEffect, useRef, type Ref } from "react";
import { EditorState, StateField, Prec } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

export interface MarkdownEditorHandle {
  element: HTMLElement;
  readonly value: string;
  readonly selectionStart: number;
  focus: (options?: FocusOptions) => void;
  setSelectionRange: (start: number, end: number) => void;
  offsetTop: (offset: number) => number;
  getBoundingClientRect: () => DOMRect;
}
class HeadingMarker extends WidgetType {
  constructor(readonly marker: string) { super(); }
  eq(other: HeadingMarker) { return this.marker === other.marker; }
  toDOM() { const outer = document.createElement("span"); outer.className = "document-markdown-marker"; outer.setAttribute("aria-hidden", "true"); const text = document.createElement("span"); text.textContent = this.marker; outer.append(text); return outer; }
  ignoreEvent() { return false; }
}
function headingDecorations(state: EditorState): DecorationSet {
  const ranges = []; let fence: string | undefined;
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const delimiter = /^\s*(`{3,}|~{3,})/.exec(line.text)?.[1];
    if (delimiter) { if (!fence) fence = delimiter; else if (delimiter[0] === fence[0] && delimiter.length >= fence.length) fence = undefined; continue; }
    if (fence) continue;
    const match = /^(#{1,6}) /.exec(line.text);
    if (match) {
      ranges.push(Decoration.line({ class: `document-editor-heading document-editor-heading-${match[1]!.length}` }).range(line.from));
      ranges.push(Decoration.replace({ widget: new HeadingMarker(match[1]!), inclusive: false }).range(line.from, line.from + match[0].length));
    }
  }
  return Decoration.set(ranges, true);
}
const headings = StateField.define<DecorationSet>({ create: headingDecorations, update: (value, transaction) => transaction.docChanged ? headingDecorations(transaction.state) : value, provide: field => EditorView.decorations.from(field) });

/** Markdown remains plain source; only the visual position of heading marks changes. */
export function MarkdownEditor({ value, label, editorRef, onChange, onSelect, onBlur, onKeyDown }: {
  value: string; label: string; editorRef: Ref<MarkdownEditorHandle>; onChange: (value: string) => void;
  onSelect: (offset: number) => void; onBlur: (event: FocusEvent) => void; onKeyDown: (event: KeyboardEvent) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>(null);
  const callbacks = useRef({ onChange, onSelect, onBlur, onKeyDown }); callbacks.current = { onChange, onSelect, onBlur, onKeyDown };
  useLayoutEffect(() => {
    const element = host.current!;
    const view = new EditorView({ parent: element, state: EditorState.create({ doc: value, extensions: [
      history(), keymap.of([...defaultKeymap, ...historyKeymap]), EditorView.lineWrapping, headings,
      EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false", "data-document-editor": "true" }),
      EditorView.updateListener.of(update => { if (update.docChanged) callbacks.current.onChange(update.state.doc.toString()); if (update.selectionSet || update.docChanged) callbacks.current.onSelect(update.state.selection.main.head); }),
      Prec.highest(EditorView.domEventHandlers({ blur: event => { callbacks.current.onBlur(event); return false; }, keydown: event => { callbacks.current.onKeyDown(event); if (event.metaKey && /Arrow(Up|Down)/.test(event.key)) { event.preventDefault(); return true; } return event.defaultPrevented; } })),
      EditorView.theme({ "&": { backgroundColor: "transparent", fontSize: "inherit", color: "inherit" }, ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit", overflow: "visible" }, ".cm-content": { padding: "0", caretColor: "var(--accent)", minHeight: "360px" }, ".cm-line": { padding: "0" }, "&.cm-focused": { outline: "none" }, ".cm-cursor": { borderLeftColor: "var(--accent)" }, ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--accent-soft)" } }),
    ] }) });
    viewRef.current = view;
    const handle: MarkdownEditorHandle = {
      element, get value() { return view.state.doc.toString(); }, get selectionStart() { return view.state.selection.main.head; },
      focus: () => view.focus(), setSelectionRange: (start, end) => view.dispatch({ selection: { anchor: Math.min(start, view.state.doc.length), head: Math.min(end, view.state.doc.length) } }),
      offsetTop: offset => view.lineBlockAt(Math.min(offset, view.state.doc.length)).top + view.contentDOM.getBoundingClientRect().top - element.getBoundingClientRect().top,
      getBoundingClientRect: () => element.getBoundingClientRect(),
    };
    if (typeof editorRef === "function") editorRef(handle); else if (editorRef) editorRef.current = handle;
    return () => { view.destroy(); viewRef.current = null; if (typeof editorRef === "function") editorRef(null); else if (editorRef) editorRef.current = null; };
  }, []);
  useLayoutEffect(() => { const view = viewRef.current; if (view && value !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } }); }, [value]);
  return <div ref={host} className="document-editor" />;
}
