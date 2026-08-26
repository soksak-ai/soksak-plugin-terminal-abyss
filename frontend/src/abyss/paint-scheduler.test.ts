import { describe, expect, it, vi } from "vitest";
import { createPaintScheduler } from "./paint-scheduler";

describe("paint scheduler", () => {
  it("uses one animation frame while visible and a 16 ms timer while hidden, never both", () => {
    let visible = true;
    const paint = vi.fn();
    const requestFrame = vi.fn(() => 1);
    const setTimer = vi.fn(() => 2);
    const scheduler = createPaintScheduler({ visible: () => visible, paint, requestFrame, setTimer, cancelFrame: vi.fn(), clearTimer: vi.fn() });
    scheduler.request();
    scheduler.request();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(setTimer).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe("frame");
    (requestFrame.mock.calls[0] as unknown as [() => void])[0]();
    expect(paint).toHaveBeenCalledTimes(1);
    expect(scheduler.pending()).toBeNull();
    visible = false;
    scheduler.request();
    scheduler.request();
    expect(setTimer).toHaveBeenCalledTimes(1);
    expect((setTimer.mock.calls[0] as unknown as [() => void, number])[1]).toBe(16);
    expect(requestFrame).toHaveBeenCalledTimes(1);
    (setTimer.mock.calls[0] as unknown as [() => void])[0]();
    expect(paint).toHaveBeenCalledTimes(2);
  });
});
