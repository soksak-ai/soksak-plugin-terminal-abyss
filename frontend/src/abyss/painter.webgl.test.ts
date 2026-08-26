import { describe, expect, it, vi } from "vitest";
import { callsNamed } from "../testEnvironment";
import { frameFixture, lineFixture, themeFixture } from "./fixtures";
import { createFrameSource } from "./frame-source";
import { measureFont } from "./font-metrics";
import { FRAGMENT_SHADER, VERTEX_SHADER, WebglPainter, createPainter } from "./painter";

const theme = themeFixture();
const metrics = measureFont({ fontFamily: "monospace", fontSize: 13, lineHeight: 1.2 }, 1);
const view = { offset: 0, historySize: 0 };

function setup(atlasSize = 1024, onFallback?: (reason: string) => void) {
  const canvas = document.createElement("canvas");
  const painter = new WebglPainter(canvas, { metrics, theme, devicePixelRatio: 1, cursorStyle: "block", atlasSize, onFallback });
  const source = createFrameSource(() => theme);
  source.applyFrame(frameFixture({ cols: 4, rows: 4, lines: [0, 1, 2, 3].map((y) => lineFixture(y, "A")) }));
  painter.resize(4, 4);
  const gl = canvas.getContext("webgl2") as object;
  return { canvas, painter, source, gl };
}

describe("webgl painter", () => {
  it("uploads only the dirty row buffers", () => {
    const { painter, source, gl } = setup();
    painter.render(source, true, view, false);
    const before = callsNamed(gl, "bufferData").length;
    expect(before).toBe(4);
    source.applyFrame(frameFixture({ cols: 4, rows: 4, full: false, outputSequence: 2, lines: [lineFixture(1, "B")] }));
    painter.render(source, false, view, false);
    expect(callsNamed(gl, "bufferData").length - before).toBe(3);
    expect(callsNamed(gl, "drawArraysInstanced").length).toBeGreaterThan(0);
  });
  it("hands over to the fallback when the context is lost", () => {
    const onFallback = vi.fn();
    const { canvas, painter, source } = setup(1024, onFallback);
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(onFallback).toHaveBeenCalledWith("webgl context lost");
    painter.render(source, true, view, false);
    expect(painter.kind).toBe("webgl");
    expect(createPainter("canvas", document.createElement("canvas"), { metrics, theme, devicePixelRatio: 1, cursorStyle: "bar" }).kind).toBe("canvas");
  });
  it("grows the atlas when a new glyph does not fit", () => {
    const { painter, source, gl } = setup(16);
    painter.render(source, true, view, false);
    const first = painter.debug();
    expect(first.glyphs).toBe(1);
    expect(first.atlasSize).toBeGreaterThan(16);
    expect(callsNamed(gl, "texImage2D")).toHaveLength(1);
    source.applyFrame(frameFixture({ cols: 4, rows: 4, full: false, outputSequence: 2, lines: [lineFixture(2, "BCDE")] }));
    painter.render(source, false, view, false);
    const second = painter.debug();
    expect(second.glyphs).toBe(5);
    expect(second.atlasSize).toBeGreaterThanOrEqual(first.atlasSize);
    expect(callsNamed(gl, "texImage2D")).toHaveLength(2);
  });
});

// A uniform a program links has one precision. The vertex stage defaults an int to highp and the
// fragment stage to mediump, so a shared uniform that leans on the default links in neither.
describe("shader precision", () => {
  const declared = (source: string) =>
    new Map([...source.matchAll(/uniform\s+(?:(highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*;/g)]
      .map((match) => [match[3], { precision: match[1], type: match[2] }] as const));
  const defaults = (source: string) =>
    new Map([...source.matchAll(/precision\s+(highp|mediump|lowp)\s+(\w+)\s*;/g)]
      .map((match) => [match[2], match[1]] as const));

  it("gives every shared uniform the same stated precision in both stages", () => {
    const vertex = declared(VERTEX_SHADER);
    const fragment = declared(FRAGMENT_SHADER);
    const vertexDefaults = defaults(VERTEX_SHADER);
    const fragmentDefaults = defaults(FRAGMENT_SHADER);
    const shared = [...vertex.keys()].filter((name) => fragment.has(name));
    expect(shared.length).toBeGreaterThan(0);
    for (const name of shared) {
      const inVertex = vertex.get(name)!;
      const inFragment = fragment.get(name)!;
      const vertexPrecision = inVertex.precision ?? vertexDefaults.get(inVertex.type);
      const fragmentPrecision = inFragment.precision ?? fragmentDefaults.get(inFragment.type);
      expect(vertexPrecision, `${name} has no stated precision in the vertex stage`).toBeDefined();
      expect(fragmentPrecision, `${name} has no stated precision in the fragment stage`).toBeDefined();
      expect(fragmentPrecision, `${name} differs between the stages`).toBe(vertexPrecision);
    }
  });
});
