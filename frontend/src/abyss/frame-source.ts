import { defaultModes, type AbyssFrame, type AbyssLine, type AbyssModes, type AbyssTheme, type RGB } from "./host";
import { createColorCache } from "./palette";

export const FLAG = Object.freeze({ BOLD: 1, DIM: 2, ITALIC: 4, UNDERLINE: 8, INVERSE: 16, STRIKE: 32, HIDDEN: 64 });
export const ROW_CACHE_CAP = 10000;

export interface Cell { cp: number; text: string; fg: RGB; bg: RGB; flags: number; width: 0 | 1 | 2; link: string | null }
export interface ApplyResult { applied: boolean; requestFull: boolean; resized: boolean }

export interface FrameSource {
  applyFrame(frame: AbyssFrame): ApplyResult;
  getLine(y: number): readonly Cell[];
  getCursor(): [number, number];
  isCursorVisible(): boolean;
  isAltActive(): boolean;
  getModes(): AbyssModes;
  getDimensions(): { cols: number; rows: number };
  getOffset(): number;
  getOutputSequence(): number;
  isRowDirty(y: number): boolean;
  dirtyRows(): number[];
  clearDirty(): void;
  markAllDirty(): void;
  needsFullRedraw(): boolean;
  getScrollbackLength(): number;
  getScrollbackLine(abs: number): readonly Cell[] | null;
  getLinkAt(abs: number, col: number): string | null;
  lineText(abs: number): string;
  rowText(y: number): string;
  read(lines?: number): string;
  invalidateTheme(): void;
  onSelectionInvalid(callback: () => void): () => void;
}

interface Row { epoch: number; line: AbyssLine; cells: Cell[] }

export function createFrameSource(theme: () => AbyssTheme): FrameSource {
  const colors = createColorCache(theme);
  const rowsByAbs = new Map<number, Row>();
  const dirty = new Set<number>();
  const selectionInvalid = new Set<() => void>();
  let epoch = 0;
  let hasBase = false;
  let fullRedraw = true;
  let cols = 0;
  let rows = 0;
  let historySize = 0;
  let offset = 0;
  let outputSequence = -1;
  let cursor: [number, number] = [0, 0];
  let cursorVisible = false;
  let altActive = false;
  let modes = defaultModes();
  let blankRow: Cell[] = [];
  let blankEpoch = -1;
  let blankCols = -1;

  const absOf = (y: number) => historySize - offset + y;
  const blankCell = (): Cell => ({
    cp: 32, text: " ", fg: colors.resolve("default", "fg", false), bg: colors.resolve("default", "bg", false),
    flags: 0, width: 1, link: null,
  });
  const blank = (): Cell[] => {
    if (blankEpoch !== epoch || blankCols !== cols) {
      blankRow = Array.from({ length: cols }, blankCell);
      blankEpoch = epoch;
      blankCols = cols;
    }
    return blankRow;
  };
  const expand = (line: AbyssLine): Cell[] => {
    const out: Cell[] = [];
    for (const run of line.runs) {
      const bold = (run.attrs & FLAG.BOLD) !== 0;
      const inverse = (run.attrs & FLAG.INVERSE) !== 0;
      const fg = inverse ? colors.resolve(run.bg, "bg", false) : colors.resolve(run.fg, "fg", bold);
      const bg = inverse ? colors.resolve(run.fg, "fg", bold) : colors.resolve(run.bg, "bg", false);
      const glyphs = Array.from(run.text);
      const per = run.wide ? 2 : 1;
      const count = Math.max(1, Math.floor(run.n / per));
      for (let index = 0; index < count; index += 1) {
        const glyph = glyphs.length === 1 ? glyphs[0] : glyphs[index] ?? " ";
        out.push({ cp: glyph.codePointAt(0) ?? 32, text: glyph, fg, bg, flags: run.attrs, width: per, link: run.link });
        if (run.wide) out.push({ cp: 0, text: "", fg, bg, flags: run.attrs, width: 0, link: run.link });
      }
    }
    while (out.length < cols) out.push(blankCell());
    if (out.length > cols) out.length = cols;
    return out;
  };
  const rowCells = (abs: number): Cell[] | null => {
    const row = rowsByAbs.get(abs);
    if (!row) return null;
    if (row.epoch !== epoch) { row.cells = expand(row.line); row.epoch = epoch; }
    return row.cells;
  };
  const textOf = (cells: readonly Cell[]) => cells.map((cell) => cell.text).join("").replace(/ +$/, "");
  const inViewport = (abs: number) => abs >= historySize - offset && abs < historySize - offset + rows;
  const evict = () => {
    if (rowsByAbs.size <= ROW_CACHE_CAP) return;
    const floor = historySize + rows - ROW_CACHE_CAP;
    for (const key of [...rowsByAbs.keys()]) if (key < floor) rowsByAbs.delete(key);
  };
  const markAll = () => { for (let y = 0; y < rows; y += 1) dirty.add(y); fullRedraw = true; };

  return {
    applyFrame(frame) {
      if (!frame.full && !hasBase) return { applied: false, requestFull: true, resized: false };
      const resized = frame.cols !== cols || frame.rows !== rows;
      const shifted = frame.historySize !== historySize || frame.offset !== offset || frame.altActive !== altActive;
      if (frame.historySize < historySize) for (const callback of selectionInvalid) callback();
      if (resized) rowsByAbs.clear();
      const wasVisible = cursorVisible;
      const previousCursorRow = cursor[0];
      cols = frame.cols; rows = frame.rows;
      cursor = [frame.cursor[0], frame.cursor[1]];
      cursorVisible = frame.cursorVisible; altActive = frame.altActive;
      historySize = frame.historySize; offset = frame.offset;
      modes = frame.modes; outputSequence = frame.outputSequence;
      if (frame.full) for (let y = 0; y < rows; y += 1) rowsByAbs.delete(absOf(y));
      for (const line of frame.lines) {
        if (line.y < 0 || line.y >= rows) continue;
        rowsByAbs.set(absOf(line.y), { epoch, line, cells: expand(line) });
        dirty.add(line.y);
      }
      if (frame.full || resized || shifted) markAll();
      if (cursorVisible || wasVisible) { dirty.add(previousCursorRow); dirty.add(cursor[0]); }
      hasBase = true;
      evict();
      return { applied: true, requestFull: false, resized };
    },
    getLine: (y) => rowCells(absOf(y)) ?? blank(),
    getCursor: () => [cursor[0], cursor[1]],
    isCursorVisible: () => cursorVisible,
    isAltActive: () => altActive,
    getModes: () => modes,
    getDimensions: () => ({ cols, rows }),
    getOffset: () => offset,
    getOutputSequence: () => outputSequence,
    isRowDirty: (y) => fullRedraw || dirty.has(y),
    dirtyRows: () => [...dirty].filter((y) => y >= 0 && y < rows).sort((a, b) => a - b),
    clearDirty() { dirty.clear(); fullRedraw = false; },
    markAllDirty: markAll,
    needsFullRedraw: () => fullRedraw,
    getScrollbackLength: () => historySize,
    getScrollbackLine: (abs) => rowCells(abs),
    getLinkAt: (abs, col) => rowCells(abs)?.[col]?.link ?? null,
    lineText(abs) {
      const cells = rowCells(abs);
      if (cells) return cells.map((cell) => cell.text).join("");
      return inViewport(abs) ? " ".repeat(cols) : "";
    },
    rowText: (y) => textOf(rowCells(absOf(y)) ?? blank()),
    // Reading answers what the pane shows: the last row is the one at the bottom of the viewport, so
    // a pane scrolled into history reads that history.
    read(lines) {
      const out: string[] = [];
      const last = historySize - offset + rows - 1;
      for (let abs = 0; abs <= last; abs += 1) {
        const cells = rowCells(abs);
        if (cells) out.push(textOf(cells));
        else if (inViewport(abs)) out.push("");
      }
      return (lines && lines > 0 ? out.slice(-lines) : out).join("\n");
    },
    invalidateTheme() { colors.invalidate(); epoch += 1; markAll(); },
    onSelectionInvalid(callback) { selectionInvalid.add(callback); return () => { selectionInvalid.delete(callback); }; },
  };
}
