export interface LinkRange { abs: number; start: number; end: number; url: string }
export interface LinkCell { text: string; width: number; link?: string | null }

const URL_RE = /(?:https?|file):\/\/[^\s"'<>`)\]]+/g;
const TRAILING = /[.,;:!?'"]+$/;

export function findUrlLinks(abs: number, cells: readonly LinkCell[]): LinkRange[] {
  let text = "";
  const colAt: number[] = [];
  cells.forEach((cell, col) => {
    if (cell.width === 0) return;
    const glyph = cell.text || " ";
    text += glyph;
    for (let index = 0; index < glyph.length; index += 1) colAt.push(col);
  });
  colAt.push(cells.length);
  const out: LinkRange[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0].replace(TRAILING, "");
    const index = match.index ?? 0;
    if (!url) continue;
    const endIndex = index + url.length;
    out.push({ abs, start: colAt[index], end: colAt[Math.min(endIndex, colAt.length - 1)], url });
  }
  return out;
}

export function findRunLinks(abs: number, cells: readonly LinkCell[]): LinkRange[] {
  const out: LinkRange[] = [];
  let col = 0;
  while (col < cells.length) {
    const link = cells[col].link ?? null;
    if (!link) { col += 1; continue; }
    let end = col + 1;
    while (end < cells.length && (cells[end].link ?? null) === link) end += 1;
    out.push({ abs, start: col, end, url: link });
    col = end;
  }
  return out;
}

export function linkAt(ranges: readonly LinkRange[], col: number): LinkRange | null {
  return ranges.find((range) => col >= range.start && col < range.end) ?? null;
}

export interface LinksOptions {
  rowCells(abs: number): readonly LinkCell[];
  open(url: string): void;
  onHover(range: LinkRange | null): void;
}
export interface LinksController {
  at(point: { abs: number; col: number }): LinkRange | null;
  hover(point: { abs: number; col: number } | null): void;
  activate(point: { abs: number; col: number }, modifier: boolean): boolean;
  current(): LinkRange | null;
  dispose(): void;
}

export function createLinks(options: LinksOptions): LinksController {
  let current: LinkRange | null = null;
  const at = (point: { abs: number; col: number }): LinkRange | null => {
    const cells = options.rowCells(point.abs);
    return linkAt(findRunLinks(point.abs, cells), point.col) ?? linkAt(findUrlLinks(point.abs, cells), point.col);
  };
  const same = (a: LinkRange | null, b: LinkRange | null) => a === b || (!!a && !!b && a.abs === b.abs && a.start === b.start && a.end === b.end && a.url === b.url);
  return {
    at,
    hover(point) {
      const next = point ? at(point) : null;
      if (same(next, current)) return;
      current = next;
      options.onHover(next);
    },
    activate(point, modifier) {
      if (!modifier) return false;
      const range = at(point);
      if (!range) return false;
      options.open(range.url);
      return true;
    },
    current: () => current,
    dispose() { current = null; },
  };
}
