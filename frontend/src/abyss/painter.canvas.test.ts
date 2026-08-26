import { describe, expect, it } from "vitest";
import { callsNamed } from "../testEnvironment";
import { frameFixture, lineFixture, themeFixture } from "./fixtures";
import { createFrameSource } from "./frame-source";
import { measureFont } from "./font-metrics";
import { CanvasPainter } from "./painter";

const theme = themeFixture();
const metrics = measureFont({ fontFamily: "monospace", fontSize: 13, lineHeight: 1.2 }, 1);
const view = { offset: 0, historySize: 0 };

function setup(rows: number, dpr = 1) {
  const canvas = document.createElement("canvas");
  const painter = new CanvasPainter(canvas, { metrics, theme, devicePixelRatio: dpr, cursorStyle: "block" });
  const source = createFrameSource(() => theme);
  const lines = Array.from({ length: rows }, (_, y) => lineFixture(y, "x"));
  source.applyFrame(frameFixture({ cols: 4, rows, lines }));
  painter.resize(4, rows);
  const context = canvas.getContext("2d") as object;
  return { canvas, painter, source, context };
}
const rowOf = (y: number) => Math.round((y - metrics.baseline) / metrics.height);

describe("canvas painter", () => {
  it("repaints only dirty rows and their neighbours", () => {
    const { painter, source, context } = setup(6);
    painter.render(source, true, view, true);
    const before = callsNamed(context, "fillText").length;
    expect(before).toBe(6);
    source.applyFrame(frameFixture({ cols: 4, rows: 6, full: false, outputSequence: 2, lines: [lineFixture(3, "y")] }));
    painter.render(source, false, view, true);
    const rows = callsNamed(context, "fillText").slice(before).map((call) => rowOf(call.args[2] as number));
    expect(rows).toEqual([2, 3, 4]);
  });
  it("scales the backing store by the device pixel ratio", () => {
    const { canvas, painter, context } = setup(2, 2);
    painter.setDevicePixelRatio(2);
    painter.resize(10, 2);
    expect(canvas.width).toBe(10 * 7 * 2);
    expect(canvas.height).toBe(2 * 18 * 2);
    expect(canvas.style.width).toBe("70px");
    expect(callsNamed(context, "setTransform").at(-1)?.args).toEqual([2, 0, 0, 2, 0, 0]);
  });
  it("outlines the cursor when unfocused", () => {
    const { painter, source, context } = setup(1);
    source.applyFrame(frameFixture({ cols: 4, rows: 1, cursorVisible: true, cursor: [0, 1], lines: [lineFixture(0, "x")] }));
    painter.render(source, true, view, false);
    expect(callsNamed(context, "strokeRect")).toHaveLength(1);
    painter.render(source, true, view, true);
    expect(callsNamed(context, "strokeRect")).toHaveLength(1);
  });
  it("draws one fillRect for a row on the default background", () => {
    const { painter, source, context } = setup(1);
    source.applyFrame(frameFixture({ cols: 4, rows: 1, lines: [lineFixture(0, "    ")] }));
    painter.render(source, true, view, true);
    expect(callsNamed(context, "fillRect")).toHaveLength(1);
    expect(callsNamed(context, "fillText")).toHaveLength(0);
  });
});
