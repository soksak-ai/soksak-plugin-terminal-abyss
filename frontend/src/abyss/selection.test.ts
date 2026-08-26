import { describe, expect, it, vi } from "vitest";
import { createSelection } from "./selection";

function setup(lines: string[], historySize = 0) {
  const surface = document.createElement("canvas");
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, right: 700, bottom: 180, width: 700, height: 180, x: 0, y: 0, toJSON: () => ({}) });
  document.body.append(surface);
  const clipboard = { writeText: vi.fn(async () => undefined) };
  const onChange = vi.fn();
  let clock = 0;
  const selection = createSelection({
    surface: () => surface, document, cell: () => ({ width: 7, height: 18 }),
    view: () => ({ offset: 0, historySize, rows: lines.length, cols: 100 }),
    lineText: (abs) => (lines[abs - historySize] ?? "").padEnd(100, " "),
    clipboard, mouseReporting: () => false, scrollBy: vi.fn(), onChange, now: () => clock,
  });
  const at = (col: number, row: number, extra: Partial<{ button: number; shiftKey: boolean }> = {}) => ({ button: 0, clientX: col * 7 + 1, clientY: row * 18 + 1, shiftKey: false, ...extra });
  return { selection, clipboard, at, tick: (ms: number) => { clock += ms; } };
}

describe("selection", () => {
  it("selects a dragged range and copies it", async () => {
    const { selection, clipboard, at } = setup(["hello world", "second line"]);
    expect(selection.pointerDown(at(0, 0))).toBe(true);
    expect(selection.hasSelection()).toBe(false);
    selection.pointerMove(at(5, 1));
    selection.pointerUp(at(5, 1));
    expect(selection.hasSelection()).toBe(true);
    expect(selection.getSelectionCoords(0)).toEqual([0, 100]);
    expect(selection.getSelectionCoords(1)).toEqual([0, 6]);
    expect(selection.getSelectionCoords(2)).toBeNull();
    expect(selection.text()).toBe("hello world\nsecond");
    expect(selection.getDirtySelectionRows()).toEqual([0, 1]);
    await expect(selection.copy()).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith("hello world\nsecond");
  });
  it("selects a word on double click and a line on triple click", () => {
    const { selection, at, tick } = setup(["see https://example.com/a now"], 4);
    selection.pointerDown(at(6, 0)); selection.pointerUp(at(6, 0));
    tick(100);
    selection.pointerDown(at(6, 0)); selection.pointerUp(at(6, 0));
    expect(selection.text()).toBe("https://example.com/a");
    expect(selection.getSelectionCoords(4)).toEqual([4, 25]);
    tick(100);
    selection.pointerDown(at(6, 0)); selection.pointerUp(at(6, 0));
    expect(selection.text()).toBe("see https://example.com/a now");
  });
  it("removes its document listener on dispose and yields to mouse reporting", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const { selection, at } = setup(["x"]);
    selection.dispose();
    expect(remove.mock.calls.some((call) => call[0] === "pointerup")).toBe(true);
    remove.mockRestore();
    const reporting = createSelection({
      surface: () => document.createElement("canvas"), document, cell: () => ({ width: 7, height: 18 }),
      view: () => ({ offset: 0, historySize: 0, rows: 1, cols: 10 }), lineText: () => "", clipboard: { writeText: async () => undefined },
      mouseReporting: () => true, scrollBy: () => undefined, onChange: () => undefined,
    });
    expect(reporting.pointerDown(at(0, 0))).toBe(false);
    expect(reporting.pointerDown(at(0, 0, { shiftKey: true }))).toBe(true);
    reporting.dispose();
  });
});
