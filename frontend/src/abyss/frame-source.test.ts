import { describe, expect, it } from "vitest";
import { frameFixture, lineFixture, themeFixture } from "./fixtures";
import { EXPANDED_CELL_CACHE_CAP, FLAG, ROW_CACHE_CAP, createFrameSource } from "./frame-source";

const theme = themeFixture();
const text = (cells: readonly { text: string }[]) => cells.map((cell) => cell.text).join("");

describe("frame source", () => {
  it("applies a delta row identically to a full frame carrying that row", () => {
    const delta = createFrameSource(() => theme);
    delta.applyFrame(frameFixture());
    expect(delta.applyFrame(frameFixture({ full: false, outputSequence: 2, lines: [lineFixture(1, "xy")] }))).toEqual({ applied: true, requestFull: false, resized: false });
    const full = createFrameSource(() => theme);
    full.applyFrame(frameFixture({ outputSequence: 2, lines: [lineFixture(0, "ab"), lineFixture(1, "xy")] }));
    expect(delta.getLine(1)).toEqual(full.getLine(1));
    expect(delta.rowText(0)).toBe("ab");
    expect(delta.read()).toBe("ab\nxy");
  });
  it("expands a run over n cells", () => {
    const source = createFrameSource(() => theme);
    source.applyFrame(frameFixture({ cols: 5, rows: 1, lines: [{ y: 0, wrapped: false, runs: [{ text: "-", fg: "default", bg: "default", attrs: 0, n: 5, wide: false, link: null }] }] }));
    expect(source.getLine(0)).toHaveLength(5);
    expect(text(source.getLine(0))).toBe("-----");
  });
  it("gives a wide glyph width 2 followed by a width 0 spacer", () => {
    const source = createFrameSource(() => theme);
    source.applyFrame(frameFixture({ cols: 3, rows: 1, lines: [{ y: 0, wrapped: false, runs: [{ text: "가", fg: "default", bg: "default", attrs: 0, n: 2, wide: true, link: "https://a.b" }] }] }));
    const cells = source.getLine(0);
    expect(cells.map((cell) => cell.width)).toEqual([2, 0, 1]);
    expect(cells[0].text).toBe("가");
    expect(cells[1].text).toBe("");
    expect(source.getLinkAt(0, 1)).toBe("https://a.b");
    expect(source.rowText(0)).toBe("가");
  });
  it("carries attrs into flags and swaps colors for inverse", () => {
    const source = createFrameSource(() => theme);
    source.applyFrame(frameFixture({ cols: 2, rows: 1, lines: [lineFixture(0, "ab", FLAG.BOLD | FLAG.UNDERLINE | FLAG.INVERSE, "palette:1", "default")] }));
    const cell = source.getLine(0)[0];
    expect(cell.flags & FLAG.BOLD).toBe(FLAG.BOLD);
    expect(cell.flags & FLAG.UNDERLINE).toBe(FLAG.UNDERLINE);
    expect(cell.fg).toEqual([0x1e, 0x1e, 0x1e]);
    expect(cell.bg).toEqual([0xef, 0x29, 0x29]);
  });
  it("caches rows by absolute index across offsets and reports shrinking history", () => {
    const source = createFrameSource(() => theme);
    let invalid = 0;
    source.onSelectionInvalid(() => { invalid += 1; });
    source.applyFrame(frameFixture({ historySize: 5, lines: [lineFixture(0, "top"), lineFixture(1, "bot")] }));
    source.clearDirty();
    source.applyFrame(frameFixture({ historySize: 5, offset: 2, full: false, outputSequence: 2, lines: [lineFixture(0, "h3"), lineFixture(1, "h4")] }));
    expect(source.rowText(0)).toBe("h3");
    expect(source.needsFullRedraw()).toBe(true);
    source.clearDirty();
    source.applyFrame(frameFixture({ historySize: 5, offset: 0, full: false, outputSequence: 3, lines: [] }));
    expect(source.rowText(0)).toBe("top");
    expect(source.rowText(1)).toBe("bot");
    expect(source.getScrollbackLine(3)?.[0].text).toBe("h");
    expect(source.read(3)).toBe("top\nbot");
    expect(invalid).toBe(0);
    source.applyFrame(frameFixture({ historySize: 2, outputSequence: 4 }));
    expect(invalid).toBe(1);
  });
  it("requests a full frame when a delta arrives without a base", () => {
    const source = createFrameSource(() => theme);
    expect(source.applyFrame(frameFixture({ full: false }))).toEqual({ applied: false, requestFull: true, resized: false });
    expect(source.getDimensions()).toEqual({ cols: 0, rows: 0 });
  });
  it("keeps compressed history while expanded cells stay inside one fixed budget", () => {
    const source = createFrameSource(() => theme);
    for (let index = 0; index < 100; index += 1) {
      source.applyFrame(frameFixture({
        cols: 80, rows: 1, historySize: index, outputSequence: index + 1, full: index === 0,
        lines: [lineFixture(0, String(index % 10).repeat(80))],
      }));
      source.getLine(0);
    }

    expect(source.cacheStats()).toMatchObject({ storedRows: 100 });
    expect(source.cacheStats().expandedCells).toBeLessThanOrEqual(EXPANDED_CELL_CACHE_CAP);
    expect(source.getScrollbackLine(0)?.[0].text).toBe("0");
    expect(source.cacheStats().expandedCells).toBeLessThanOrEqual(EXPANDED_CELL_CACHE_CAP);
  });
  it("bounds compressed history independently of terminal output volume", () => {
    const source = createFrameSource(() => theme);
    for (let index = 0; index < 2200; index += 1) {
      source.applyFrame(frameFixture({
        cols: 1, rows: 1, historySize: index, outputSequence: index + 1, full: index === 0,
        lines: [lineFixture(0, "x")],
      }));
    }

    expect(ROW_CACHE_CAP).toBe(2048);
    expect(source.cacheStats().storedRows).toBeLessThanOrEqual(ROW_CACHE_CAP);
    expect(source.getScrollbackLine(0)).toBeNull();
  });
  it("retains one whole large viewport without expanding its rows again", () => {
    const source = createFrameSource(() => theme);
    const cols = 300;
    const rows = 80;
    source.applyFrame(frameFixture({
      cols,
      rows,
      lines: Array.from({ length: rows }, (_, y) => lineFixture(y, String(y % 10).repeat(cols))),
    }));

    const first = Array.from({ length: rows }, (_, y) => source.getLine(y));
    expect(source.cacheStats()).toMatchObject({
      expandedRows: rows,
      expandedCells: cols * rows,
      expandedCellLimit: cols * rows,
    });
    const second = Array.from({ length: rows }, (_, y) => source.getLine(y));
    second.forEach((line, y) => expect(line).toBe(first[y]));
  });
});

// Reading answers what the pane shows. A pane scrolled into history reads that history, which is
// what makes scroll-then-read a way to read the scrollback.
describe("reading a scrolled source", () => {
  it("ends at the bottom of the viewport, not at the bottom of the buffer", () => {
    const source = createFrameSource(() => themeFixture());
    source.applyFrame(frameFixture({
      cols: 8, rows: 2, historySize: 10, offset: 0,
      lines: [lineFixture(0, "bottom-a"), lineFixture(1, "bottom-b")],
    }));
    expect(source.read(1)).toBe("bottom-b");
    source.applyFrame(frameFixture({
      cols: 8, rows: 2, historySize: 10, offset: 4, outputSequence: 2,
      lines: [lineFixture(0, "older-a"), lineFixture(1, "older-b")],
    }));
    expect(source.read(1)).toBe("older-b");
  });
});
