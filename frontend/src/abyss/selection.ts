import type { SelectionOverlay } from "./painter";

export interface SelectionPoint { abs: number; col: number }
export interface PointerLike {
  button: number; buttons?: number; clientX: number; clientY: number;
  shiftKey: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; pointerId?: number;
}
export interface SelectionOptions {
  surface: () => HTMLElement;
  document: Document;
  cell: () => { width: number; height: number };
  view: () => { offset: number; historySize: number; rows: number; cols: number };
  lineText: (abs: number) => string;
  clipboard: { writeText(text: string): Promise<void> };
  mouseReporting: () => boolean;
  scrollBy: (lines: number) => void;
  onChange: () => void;
  now?: () => number;
}
export interface SelectionController extends SelectionOverlay {
  pointerDown(event: PointerLike): boolean;
  pointerMove(event: PointerLike): void;
  pointerUp(event: PointerLike): void;
  cellFromPoint(clientX: number, clientY: number): SelectionPoint & { row: number };
  clear(): void;
  invalidate(): void;
  isDragging(): boolean;
  text(): string;
  copy(): Promise<boolean>;
  dispose(): void;
}

type Mode = "cell" | "word" | "line";
const WORD = /[\p{L}\p{N}_\-./~:@#%+=]/u;
const MULTI_CLICK_MS = 400;
const AUTO_SCROLL_MS = 60;

export function createSelection(options: SelectionOptions): SelectionController {
  const now = options.now ?? (() => Date.now());
  let anchor: SelectionPoint | null = null;
  let focus: SelectionPoint | null = null;
  let mode: Mode = "cell";
  let dragging = false;
  let lastClick = { at: 0, abs: -1, col: -1, count: 0 };
  let autoScroll: ReturnType<typeof setInterval> | null = null;
  let autoDirection = 0;
  const dirty = new Set<number>();

  const ordered = (): [SelectionPoint, SelectionPoint] | null => {
    if (!anchor || !focus) return null;
    const forward = anchor.abs < focus.abs || (anchor.abs === focus.abs && anchor.col <= focus.col);
    return forward ? [anchor, focus] : [focus, anchor];
  };
  const hasSelection = () => {
    const range = ordered();
    return !!range && (mode !== "cell" || range[0].abs !== range[1].abs || range[0].col !== range[1].col);
  };
  const markRange = () => {
    const range = ordered();
    if (!range) return;
    const view = options.view();
    const base = view.historySize - view.offset;
    const from = Math.max(range[0].abs, base);
    const to = Math.min(range[1].abs, base + view.rows - 1);
    for (let abs = from; abs <= to; abs += 1) dirty.add(abs);
  };
  const change = () => { markRange(); options.onChange(); };
  const wordBounds = (abs: number, col: number): [number, number] => {
    const text = options.lineText(abs);
    if (!WORD.test(text[col] ?? "")) return [col, col];
    let start = col;
    let end = col;
    while (start > 0 && WORD.test(text[start - 1])) start -= 1;
    while (end + 1 < text.length && WORD.test(text[end + 1])) end += 1;
    return [start, end];
  };
  const extend = (point: SelectionPoint, side: "anchor" | "focus"): SelectionPoint => {
    const view = options.view();
    if (mode === "line") return { abs: point.abs, col: side === "anchor" ? 0 : view.cols - 1 };
    if (mode === "word") {
      const [start, end] = wordBounds(point.abs, point.col);
      const forward = !anchor || point.abs > anchor.abs || (point.abs === anchor.abs && point.col >= anchor.col);
      return { abs: point.abs, col: side === "anchor" ? (forward ? start : end) : (forward ? end : start) };
    }
    return point;
  };
  const cellFromPoint = (clientX: number, clientY: number) => {
    const rect = options.surface().getBoundingClientRect();
    const cell = options.cell();
    const view = options.view();
    const col = Math.min(Math.max(Math.floor((clientX - rect.left) / cell.width), 0), Math.max(0, view.cols - 1));
    const row = Math.min(Math.max(Math.floor((clientY - rect.top) / cell.height), 0), Math.max(0, view.rows - 1));
    return { abs: view.historySize - view.offset + row, col, row };
  };
  const stopAutoScroll = () => {
    if (autoScroll !== null) clearInterval(autoScroll);
    autoScroll = null;
    autoDirection = 0;
  };
  const startAutoScroll = (direction: number) => {
    if (autoDirection === direction) return;
    stopAutoScroll();
    autoDirection = direction;
    autoScroll = setInterval(() => {
      options.scrollBy(direction);
      if (focus) {
        const view = options.view();
        focus = { abs: Math.min(Math.max(focus.abs + direction, 0), view.historySize + view.rows - 1), col: focus.col };
        change();
      }
    }, AUTO_SCROLL_MS);
  };
  const clear = () => {
    if (!anchor && !focus) return;
    markRange();
    anchor = null; focus = null; dragging = false;
    stopAutoScroll();
    options.onChange();
  };
  const onDocumentPointerUp = () => { if (dragging) { dragging = false; stopAutoScroll(); options.onChange(); } };
  options.document.addEventListener("pointerup", onDocumentPointerUp);

  return {
    hasSelection,
    getSelectionCoords(abs) {
      const range = ordered();
      if (!range || !hasSelection() || abs < range[0].abs || abs > range[1].abs) return null;
      const cols = options.view().cols;
      const start = abs === range[0].abs ? range[0].col : 0;
      const end = abs === range[1].abs ? range[1].col + 1 : cols;
      return [start, end];
    },
    getDirtySelectionRows: () => [...dirty],
    clearDirtySelectionRows() { dirty.clear(); },
    cellFromPoint,
    isDragging: () => dragging,
    pointerDown(event) {
      if (event.button !== 0) return false;
      if (options.mouseReporting() && !event.shiftKey) return false;
      const point = cellFromPoint(event.clientX, event.clientY);
      const at = now();
      const repeat = at - lastClick.at <= MULTI_CLICK_MS && lastClick.abs === point.abs && lastClick.col === point.col;
      const count = repeat ? lastClick.count + 1 : 1;
      lastClick = { at, abs: point.abs, col: point.col, count };
      markRange();
      mode = count % 3 === 2 ? "word" : count % 3 === 0 ? "line" : "cell";
      anchor = { abs: point.abs, col: point.col };
      anchor = extend(anchor, "anchor");
      focus = extend({ abs: point.abs, col: point.col }, "focus");
      dragging = true;
      const surface = options.surface();
      if (event.pointerId !== undefined && typeof surface.setPointerCapture === "function") {
        try { surface.setPointerCapture(event.pointerId); } catch { /* capture is best effort */ }
      }
      change();
      return true;
    },
    pointerMove(event) {
      if (!dragging) return;
      const rect = options.surface().getBoundingClientRect();
      const point = cellFromPoint(event.clientX, event.clientY);
      focus = extend({ abs: point.abs, col: point.col }, "focus");
      if (anchor && mode === "word") anchor = extend(anchor, "anchor");
      if (event.clientY < rect.top) startAutoScroll(-1);
      else if (event.clientY > rect.bottom) startAutoScroll(1);
      else stopAutoScroll();
      change();
    },
    pointerUp() {
      if (!dragging) return;
      dragging = false;
      stopAutoScroll();
      options.onChange();
    },
    clear,
    invalidate: clear,
    text() {
      const range = ordered();
      if (!range || !hasSelection()) return "";
      const lines: string[] = [];
      for (let abs = range[0].abs; abs <= range[1].abs; abs += 1) {
        const text = options.lineText(abs);
        const start = abs === range[0].abs ? range[0].col : 0;
        const end = abs === range[1].abs ? range[1].col + 1 : text.length;
        const slice = text.slice(start, end);
        lines.push(abs === range[1].abs ? slice.replace(/ +$/, "") : slice.replace(/ +$/, ""));
      }
      return lines.join("\n");
    },
    async copy() {
      const text = this.text();
      if (!text) return false;
      await options.clipboard.writeText(text);
      return true;
    },
    dispose() {
      stopAutoScroll();
      options.document.removeEventListener("pointerup", onDocumentPointerUp);
      anchor = null; focus = null; dragging = false;
    },
  };
}
