export interface PaintScheduler { request(): void; cancel(): void; pending(): "frame" | "timer" | null; dispose(): void }
export interface PaintSchedulerOptions {
  visible: () => boolean;
  paint: () => void;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (id: number) => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  hiddenDelayMs?: number;
}

export function createPaintScheduler(options: PaintSchedulerOptions): PaintScheduler {
  const requestFrame = options.requestFrame ?? ((callback) => globalThis.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((id) => globalThis.cancelAnimationFrame(id));
  const setTimer = options.setTimer ?? ((callback, ms) => globalThis.setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>));
  const delay = options.hiddenDelayMs ?? 16;
  const framesAvailable = typeof globalThis.requestAnimationFrame === "function" || options.requestFrame !== undefined;
  let pending: "frame" | "timer" | null = null;
  let handle: unknown = null;
  let disposed = false;
  const run = () => { pending = null; handle = null; if (!disposed) options.paint(); };
  return {
    request() {
      if (pending || disposed) return;
      if (options.visible() && framesAvailable) { pending = "frame"; handle = requestFrame(run); }
      else { pending = "timer"; handle = setTimer(run, delay); }
    },
    cancel() {
      if (pending === "frame") cancelFrame(handle as number);
      else if (pending === "timer") clearTimer(handle);
      pending = null; handle = null;
    },
    pending: () => pending,
    dispose() { this.cancel(); disposed = true; },
  };
}
