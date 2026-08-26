import { describe, expect, it, vi } from "vitest";
import { createViewport } from "./viewport";

describe("viewport", () => {
  it("clamps offsets, requests frames, and converts wheel deltas", () => {
    const state = { offset: 0, historySize: 10, rows: 5 };
    const request = vi.fn();
    const viewport = createViewport({ state: () => state, request, scrollLines: () => 3 });
    viewport.scrollLines(-3);
    expect(request).toHaveBeenLastCalledWith(3);
    viewport.scrollLines(-100);
    expect(request).toHaveBeenLastCalledWith(10);
    state.offset = 10;
    viewport.settle(10);
    viewport.scrollLines(100);
    expect(request).toHaveBeenLastCalledWith(0);
    state.offset = 0;
    viewport.settle(0);
    viewport.toBottom();
    expect(request).toHaveBeenCalledTimes(3);
    expect(viewport.wheelLines({ deltaY: -1, deltaMode: 1 }, 18)).toBe(-3);
    expect(viewport.wheelLines({ deltaY: 1, deltaMode: 2 }, 18)).toBe(5);
    expect(viewport.wheelLines({ deltaY: 10, deltaMode: 0 }, 18)).toBe(0);
    expect(viewport.wheelLines({ deltaY: 10, deltaMode: 0 }, 18)).toBe(1);
  });
});
