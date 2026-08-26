import { afterEach, describe, expect, it, vi } from "vitest";
import { frameFixture, lineFixture, themeFixture } from "./fixtures";
import type { AbyssHost } from "./host";
import { createPanePresenter } from "./pane-presenter";

function hostFixture(visible: boolean): AbyssHost {
  return {
    theme: themeFixture, onThemeChange: () => () => undefined,
    presentation: () => ({ visible }), onPresentationChange: () => () => undefined,
    clipboard: { writeText: async () => undefined }, openUrl: () => undefined,
    settings: { fontFamily: "monospace", fontSize: 13, lineHeight: 1.2, cursorStyle: "block", cursorBlink: false, optionAsMeta: true, scrollLines: 3, renderer: "canvas" },
    devicePixelRatio: () => 1, now: () => performance.now(),
  };
}
function rootFixture() {
  const root = document.createElement("div");
  Object.defineProperty(root, "clientWidth", { value: 700 });
  Object.defineProperty(root, "clientHeight", { value: 180 });
  document.body.append(root);
  return root;
}

afterEach(() => { vi.useRealTimers(); });

describe("pane presenter", () => {
  it("measures columns and rows from the root and the font", () => {
    const presenter = createPanePresenter({ root: rootFixture(), send: vi.fn(), host: hostFixture(true), createResizeObserver: () => null });
    expect(presenter.fit()).toEqual({ cols: 100, rows: 10 });
    expect(presenter.measure()).toEqual({ cols: 100, rows: 10 });
    expect(presenter.size()).toEqual({ cols: 0, rows: 0 });
    presenter.applyFrame(frameFixture({ cols: 100, rows: 10, lines: [lineFixture(0, "ready")] }));
    expect(presenter.size()).toEqual({ cols: 100, rows: 10 });
    expect(presenter.read(1)).toBe("");
    expect(presenter.rowText(0)).toBe("ready");
    expect(presenter.root.dataset.cols).toBe("100");
    expect(presenter.renderer()).toBe("canvas");
    presenter.dispose();
  });
  it("advances the render sequence through a timer when no animation frame runs", () => {
    vi.useFakeTimers();
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const root = rootFixture();
    const presenter = createPanePresenter({ root, send: vi.fn(), host: hostFixture(false), createResizeObserver: () => null });
    const rendered = vi.fn();
    presenter.onRendered(rendered);
    expect(presenter.applyFrame(frameFixture())).toBe(true);
    expect(presenter.screen.dataset.renderSequence).toBeUndefined();
    vi.advanceTimersByTime(16);
    expect(presenter.screen.dataset.renderSequence).toBe("1");
    expect(rendered).toHaveBeenCalledTimes(1);
    expect(raf).not.toHaveBeenCalled();
    expect(presenter.applyFrame(frameFixture({ full: false, outputSequence: 2, lines: [lineFixture(1, "zz")] }))).toBe(true);
    vi.advanceTimersByTime(16);
    expect(presenter.screen.dataset.renderSequence).toBe("2");
    expect(presenter.read()).toBe("ab\nzz");
    raf.mockRestore();
    presenter.dispose();
  });
  it("suffixes node names and requests a full frame for a baseless delta", () => {
    const root = rootFixture();
    const requests = vi.fn();
    root.addEventListener("soksak:terminal-frame-request", requests);
    const presenter = createPanePresenter({ root, send: vi.fn(), host: hostFixture(true), nodeSuffix: "b", createResizeObserver: () => null });
    expect(root.querySelector('[data-node="terminal-screen/b"]')).toBe(presenter.screen);
    expect(root.querySelector('[data-node="terminal-input/b"]')).toBe(presenter.input);
    expect(presenter.applyFrame(frameFixture({ full: false }))).toBe(false);
    expect(requests).toHaveBeenCalledTimes(1);
    expect(presenter.focus()).toBe(true);
    expect(presenter.input.dataset.focused).toBe("true");
    presenter.dispose();
    expect(root.querySelector("canvas")).toBeNull();
  });
});

describe("a renderer that fails after taking its context", () => {
  // A canvas keeps the first kind of context it is given. A WebGL painter that took its context and
  // then failed leaves a canvas the 2d painter cannot use, so the pane paints on one of its own and
  // states why it stopped asking for WebGL.
  it("paints on a canvas of its own and states the refusal", () => {
    const original = HTMLCanvasElement.prototype.getContext;
    const broken = new WeakSet<HTMLCanvasElement>();
    let first = true;
    HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, kind: string, ...rest: unknown[]): unknown {
      if (kind === "webgl2") {
        if (!first) return null;
        first = false;
        broken.add(this);
        const context = (original as (this: HTMLCanvasElement, k: string) => unknown).call(this, "webgl2") as Record<string, unknown>;
        return { ...context, createVertexArray: () => null };
      }
      if (kind === "2d" && broken.has(this)) return null;
      return (original as (this: HTMLCanvasElement, k: string, ...a: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
    try {
      const host = { ...hostFixture(true), settings: { ...hostFixture(true).settings, renderer: "webgl" as const } };
      const root = rootFixture();
      const presenter = createPanePresenter({ root, send: vi.fn(), host, createResizeObserver: () => null });
      expect(presenter.renderer()).toBe("canvas");
      expect(root.dataset.renderer).toBe("canvas");
      expect(root.dataset.rendererRefusal ?? "").not.toBe("");
      presenter.applyFrame(frameFixture({ cols: 100, rows: 10, lines: [lineFixture(0, "ready")] }));
      expect(presenter.rowText(0)).toBe("ready");
      presenter.dispose();
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });
});

describe("a driven composition", () => {
  // The intermediate states of a composition are not input. Only the committed text reaches the
  // terminal, once, and the caller is told how many times.
  it("emits the committed text once and reports it", () => {
    const send = vi.fn();
    const presenter = createPanePresenter({ root: rootFixture(), send, host: hostFixture(true), createResizeObserver: () => null });
    const emitted = presenter.compose(["ㅎ", "하", "한"], "한");
    expect(send.mock.calls.map(([text]) => text)).toEqual(["한"]);
    expect(emitted).toBe(1);
    presenter.dispose();
  });
  it("shows a resumed Korean preedit at the cursor and hides it after commit", () => {
    const presenter = createPanePresenter({ root: rootFixture(), send: vi.fn(), host: hostFixture(true), createResizeObserver: () => null });
    presenter.applyFrame(frameFixture({ cols: 100, rows: 10, cursor: [2, 3], cursorVisible: true }));
    presenter.input.dispatchEvent(new CompositionEvent("compositionupdate", { data: "한" }));
    const preedit = presenter.root.querySelector<HTMLElement>('[data-node="terminal-ime-preedit"]');
    expect(preedit).not.toBeNull();
    expect(preedit).toMatchObject({ hidden: false, textContent: "한" });
    expect(preedit?.style.left).not.toBe("");
    expect(preedit?.style.top).not.toBe("");
    presenter.input.dispatchEvent(new CompositionEvent("compositionend", { data: "한" }));
    expect(preedit?.hidden).toBe(true);
    presenter.dispose();
  });
});
