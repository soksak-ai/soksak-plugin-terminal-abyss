import { describe, expect, it } from "vitest";
import { measureFont } from "./font-metrics";

describe("font metrics", () => {
  it("derives cell width, height and baseline from the font at the device ratio", () => {
    const metrics = measureFont({ fontFamily: "monospace", fontSize: 13, lineHeight: 1.2 }, 2);
    expect(metrics.width).toBe(7);
    expect(metrics.height).toBe(18);
    expect(metrics.baseline).toBe(12.5);
    expect(metrics.dpr).toBe(2);
  });
});
