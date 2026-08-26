export interface Viewport {
  target(): number;
  scrollLines(lines: number): void;
  scrollTo(offset: number): void;
  toBottom(): void;
  settle(offset: number): void;
  wheelLines(event: { deltaY: number; deltaMode: number }, cellHeight: number): number;
}
export interface ViewportOptions {
  state: () => { offset: number; historySize: number; rows: number };
  request: (offset: number) => void;
  scrollLines: () => number;
}

export function createViewport(options: ViewportOptions): Viewport {
  let pending: number | null = null;
  let pixels = 0;
  const clamp = (offset: number) => Math.min(Math.max(Math.round(offset), 0), options.state().historySize);
  const current = () => pending ?? options.state().offset;
  const scrollTo = (offset: number) => {
    const target = clamp(offset);
    if (target === current()) return;
    pending = target;
    options.request(target);
  };
  return {
    target: current,
    scrollTo,
    scrollLines: (lines) => scrollTo(current() - lines),
    toBottom: () => scrollTo(0),
    settle(offset) { if (pending === offset) pending = null; else if (pending !== null && offset !== options.state().offset) pending = null; },
    wheelLines(event, cellHeight) {
      if (event.deltaMode === 1) return Math.trunc(event.deltaY) * options.scrollLines();
      if (event.deltaMode === 2) return Math.trunc(event.deltaY) * options.state().rows;
      pixels += event.deltaY;
      const lines = Math.trunc(pixels / Math.max(1, cellHeight));
      pixels -= lines * cellHeight;
      return lines;
    },
  };
}
