import { describe, expect, it } from "vitest";
import { decodeFrame } from "./frame-decode";
import { frameFixture } from "./fixtures";

describe("frame decode", () => {
  it("decodes a well-formed frame and names the first missing key", () => {
    const wire = JSON.parse(JSON.stringify(frameFixture())) as Record<string, unknown>;
    const decoded = decodeFrame(wire);
    expect(decoded.lines).toBe(wire.lines);
    expect(decoded.lines[0].runs[0]).toBe((wire.lines as { runs: unknown[] }[])[0].runs[0]);
    expect(decoded.lines[0].runs[0]).toEqual({ text: "ab", fg: "default", bg: "default", attrs: 0, n: 2, wide: false, link: null });
    expect(decoded.cursor).toEqual([0, 0]);
    delete wire.historySize;
    expect(() => decodeFrame(wire)).toThrow("frame.historySize");
    const modes = JSON.parse(JSON.stringify(frameFixture())) as { modes: Record<string, unknown> };
    delete modes.modes.sgrMouse;
    expect(() => decodeFrame(modes)).toThrow("frame.modes.sgrMouse");
    const run = JSON.parse(JSON.stringify(frameFixture())) as { lines: { runs: Record<string, unknown>[] }[] };
    delete run.lines[1].runs[0].n;
    expect(() => decodeFrame(run)).toThrow("frame.lines[1].runs[0].n");
  });
});
