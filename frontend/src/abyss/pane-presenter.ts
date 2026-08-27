import { decodeFrame } from "./frame-decode";
import { ROW_CACHE_CAP, createFrameSource } from "./frame-source";
import { fontCss, measureFont, type FontMetrics } from "./font-metrics";
import type { AbyssHost, AbyssRenderer, AbyssTheme } from "./host";
import { bindInput } from "./input";
import { createLinks } from "./links";
import { createPainter, type AtlasPool, type GlyphAtlas, type Painter } from "./painter";
import { createPaintScheduler } from "./paint-scheduler";
import { createSelection } from "./selection";
import { createViewport } from "./viewport";

export interface PanePresenterOptions {
  root: HTMLElement;
  send(text: string): void;
  host: AbyssHost;
  nodeSuffix?: string | null;
  createCanvas?: () => HTMLCanvasElement;
  // The glyph atlas every pane in this plugin draws from. Panes that share a font share its pixels.
  atlases?: AtlasPool;
  createResizeObserver?: (callback: () => void) => { observe(element: Element): void; disconnect(): void } | null;
}
export interface PanePresenter {
  root: HTMLElement;
  screen: HTMLCanvasElement;
  input: HTMLTextAreaElement;
  applyFrame(frame: unknown): boolean;
  renderFrame(frame: unknown): void;
  fit(): { cols: number; rows: number };
  measure(): { cols: number; rows: number };
  metrics(): { cellWidth: number; cellHeight: number };
  size(): { cols: number; rows: number };
  read(lines?: number): string;
  rowText(y: number): string;
  waitForText(contains: string, timeoutMs: number): Promise<string>;
  focus(): boolean;
  prepareFocusTransfer(): void;
  refresh(): void;
  onRendered(callback: (durationMs: number) => void): { dispose(): void };
  scrollLines(lines: number): void;
  scrollTo(offset: number): void;
  selectionText(): string;
  copySelection(): Promise<boolean>;
  clearSelection(): void;
  compose(updates: readonly string[], data: string): number;
  paste(text: string): void;
  renderer(): AbyssRenderer;
  dispose(): void;
}

const BLINK_MS = 530;

export function createPanePresenter(options: PanePresenterOptions): PanePresenter {
  const { root, host } = options;
  const document = root.ownerDocument;
  const suffix = options.nodeSuffix ?? null;
  const nodeName = (base: string) => (suffix ? `${base}/${suffix}` : base);
  const createCanvas = options.createCanvas ?? (() => document.createElement("canvas"));
  const settings = host.settings;
  let theme: AbyssTheme = host.theme();
  let dpr = host.devicePixelRatio();
  let metrics: FontMetrics = measureFont(settings, dpr, createCanvas);

  root.dataset.node = nodeName("terminal-root");
  if (!root.style.position) root.style.position = "relative";
  root.style.overflow = "hidden";
  root.dataset.cols = "0"; root.dataset.rows = "0"; root.dataset.offset = "0"; root.dataset.historySize = "0";

  const decorate = (canvas: HTMLCanvasElement) => {
    canvas.dataset.node = nodeName("terminal-screen");
    canvas.setAttribute("role", "log");
    canvas.setAttribute("aria-live", "polite");
    canvas.tabIndex = -1;
    Object.assign(canvas.style, { display: "block", position: "absolute", top: "0", left: "0" });
    canvas.style.backgroundColor = theme.background;
  };
  let canvas = createCanvas();
  decorate(canvas);
  const input = document.createElement("textarea");
  input.dataset.node = nodeName("terminal-input");
  input.dataset.focused = "false";
  input.setAttribute("aria-label", "Terminal input");
  input.autocapitalize = "off"; input.autocomplete = "off"; input.spellcheck = false;
  Object.assign(input.style, { position: "absolute", top: "0", left: "0", width: "1px", height: "1px", opacity: "0", margin: "0", padding: "0", border: "0", resize: "none" });
  const preedit = document.createElement("span");
  preedit.dataset.node = nodeName("terminal-ime-preedit");
  preedit.hidden = true;
  Object.assign(preedit.style, {
    position: "absolute", pointerEvents: "none", whiteSpace: "pre", zIndex: "2",
  });
  root.append(canvas, input, preedit);

  const source = createFrameSource(() => theme);
  const syncCacheDataset = () => {
    const cache = source.cacheStats();
    root.dataset.cacheStoredRows = String(cache.storedRows);
    root.dataset.cacheExpandedRows = String(cache.expandedRows);
    root.dataset.cacheExpandedEntries = String(cache.expandedCells);
    root.dataset.cacheEntryLimit = String(cache.expandedCellLimit);
  };
  root.dataset.cacheRowLimit = String(ROW_CACHE_CAP);
  syncCacheDataset();
  let cols = 0;
  let rows = 0;
  let measured = { cols: 0, rows: 0 };
  let renderSequence = 0;
  let preeditText = "";
  let blinkOn = true;
  let blinkTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;
  const renderedListeners = new Set<(durationMs: number) => void>();
  const textListeners = new Set<(text: string) => void>();
  const focused = () => document.activeElement === input;
  const view = () => ({ offset: source.getOffset(), historySize: source.getScrollbackLength(), rows, cols });
  const placePreedit = (text: string) => {
    preeditText = text;
    preedit.textContent = text;
    preedit.hidden = text === "";
    if (!text) return;
    const [row, col] = source.getCursor();
    preedit.style.left = `${col * metrics.width}px`;
    preedit.style.top = `${row * metrics.height}px`;
    preedit.style.minWidth = `${Math.max(metrics.width, Array.from(text).length * metrics.width)}px`;
    preedit.style.height = `${metrics.height}px`;
    preedit.style.lineHeight = `${metrics.height}px`;
    preedit.style.font = fontCss(metrics, false, false);
    preedit.style.color = theme.foreground;
    preedit.style.backgroundColor = theme.background;
  };

  const selection = createSelection({
    surface: () => canvas, document,
    cell: () => ({ width: metrics.width, height: metrics.height }),
    view, lineText: (abs) => source.lineText(abs),
    clipboard: host.clipboard, mouseReporting: () => { const m = source.getModes(); return m.mouseClick || m.mouseDrag || m.mouseMotion; },
    scrollBy: (lines) => viewport.scrollLines(lines),
    onChange: () => scheduler.request(), now: () => host.now(),
  });
  source.onSelectionInvalid(() => selection.invalidate());
  const links = createLinks({
    rowCells: (abs) => source.getScrollbackLine(abs) ?? [],
    open: (url) => host.openUrl(url),
    onHover: (range) => { canvas.style.cursor = range ? "pointer" : ""; scheduler.request(); },
  });
  const viewport = createViewport({
    state: () => ({ offset: source.getOffset(), historySize: source.getScrollbackLength(), rows }),
    request: (offset) => root.dispatchEvent(new CustomEvent("soksak:terminal-viewport", { bubbles: true, detail: { offset } })),
    scrollLines: () => settings.scrollLines,
  });

  let building = true;
  let refusal = "";
  const atlases = options.atlases ?? null;
  let atlas: GlyphAtlas | null = null;
  const heldAtlas = () => {
    if (!atlases) return undefined;
    if (!atlas) atlas = atlases.acquire(metrics, dpr);
    return atlas;
  };
  const releaseAtlas = () => {
    if (atlases && atlas) atlases.release(atlas);
    atlas = null;
  };
  const painterOptions = () => ({
    metrics, theme, devicePixelRatio: dpr, cursorStyle: settings.cursorStyle, selection, createCanvas,
    atlas: heldAtlas(),
    onFallback: (reason?: string) => { if (reason) refusal = refusal || reason; if (!building) fallback(); },
  });
  let painter: Painter = buildPainter();
  building = false;
  root.dataset.renderer = painter.kind;
  if (refusal) root.dataset.rendererRefusal = refusal;

  // The first painter is built on the canvas already in the pane. A renderer that refuses leaves that
  // canvas spent, so the 2d painter gets one of its own.
  function buildPainter(): Painter {
    try { return createPainter(settings.renderer, canvas, painterOptions()); }
    catch (reason) {
      refusal = refusal || (reason instanceof Error ? reason.message : String(reason));
      return swapCanvas("canvas");
    }
  }

  function swapCanvas(kind: AbyssRenderer): Painter {
    const next = createCanvas();
    decorate(next);
    canvas.replaceWith(next);
    canvas = next;
    const created = createPainter(kind, canvas, painterOptions());
    created.resize(cols, rows);
    canvas.dataset.renderSequence = String(renderSequence);
    syncCursorDataset();
    return created;
  }
  function fallback(): void {
    if (disposed || building || painter.kind === "canvas") return;
    painter.dispose();
    painter = swapCanvas("canvas");
    root.dataset.renderer = painter.kind;
    if (refusal) root.dataset.rendererRefusal = refusal;
    source.markAllDirty();
    scheduler.request();
  }

  const scheduler = createPaintScheduler({
    visible: () => host.presentation().visible && document.visibilityState !== "hidden",
    paint: () => paint(false),
  });
  function paint(forceAll: boolean): void {
    if (disposed || cols <= 0 || rows <= 0) return;
    const started = host.now();
    painter.render(source, forceAll, { offset: source.getOffset(), historySize: source.getScrollbackLength() }, focused(), {
      cursorOn: !settings.cursorBlink || blinkOn, link: links.current(),
    });
    syncCacheDataset();
    renderSequence += 1;
    canvas.dataset.renderSequence = String(renderSequence);
    const duration = Math.max(0, host.now() - started);
    for (const listener of renderedListeners) listener(duration);
  }
  function syncCursorDataset(): void {
    const cursor = source.getCursor();
    const visible = source.isCursorVisible();
    canvas.dataset.cursorRow = String(cursor[0]);
    canvas.dataset.cursorColumn = String(cursor[1]);
    canvas.dataset.cursorVisible = String(visible);
    canvas.dataset.cursorActive = String(visible && focused());
    canvas.dataset.altActive = String(source.isAltActive());
    input.dataset.focused = String(focused());
    input.style.left = `${cursor[1] * metrics.width}px`;
    input.style.top = `${cursor[0] * metrics.height}px`;
    input.style.width = `${metrics.width}px`;
    input.style.height = `${metrics.height}px`;
    if (preeditText) placePreedit(preeditText);
  }
  const stopBlink = () => { if (blinkTimer !== null) clearInterval(blinkTimer); blinkTimer = null; blinkOn = true; };
  const startBlink = () => {
    if (!settings.cursorBlink || blinkTimer !== null) return;
    blinkTimer = setInterval(() => { blinkOn = !blinkOn; if (source.isCursorVisible()) scheduler.request(); }, BLINK_MS);
  };
  const onFocusChange = () => {
    syncCursorDataset();
    if (focused()) startBlink(); else stopBlink();
    scheduler.request();
  };
  input.addEventListener("focus", onFocusChange);
  input.addEventListener("blur", onFocusChange);

  const inputBinding = bindInput({
    root, input, send: options.send,
    modes: () => source.getModes(), altActive: () => source.isAltActive(), appCursor: () => source.getModes().appCursor,
    optionAsMeta: () => settings.optionAsMeta,
    cell: () => ({ width: metrics.width, height: metrics.height }), rows: () => rows,
    viewport, selection, links, now: () => host.now(),
    onActivity: () => { blinkOn = true; },
    onPreedit: placePreedit,
  });

  const fit = () => {
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (width <= 0 || height <= 0) return { ...measured };
    measured = { cols: Math.max(1, Math.floor(width / metrics.width)), rows: Math.max(1, Math.floor(height / metrics.height)) };
    return { ...measured };
  };
  const observer = (options.createResizeObserver ?? ((callback) => typeof ResizeObserver === "function" ? new ResizeObserver(callback) : null))(() => { fit(); });
  observer?.observe(root);

  const stopTheme = host.onThemeChange(() => {
    theme = host.theme();
    canvas.style.backgroundColor = theme.background;
    source.invalidateTheme();
    painter.setTheme(theme);
    scheduler.request();
  });
  const stopPresentation = host.onPresentationChange((presentation) => { if (presentation.visible) scheduler.request(); });

  const applyFrame = (value: unknown): boolean => {
    const frame = decodeFrame(value);
    const result = source.applyFrame(frame);
    if (result.requestFull) {
      root.dispatchEvent(new CustomEvent("soksak:terminal-frame-request", { bubbles: true, detail: { full: true } }));
      return false;
    }
    if (frame.cols !== cols || frame.rows !== rows) {
      cols = frame.cols; rows = frame.rows;
      painter.resize(cols, rows);
    }
    viewport.settle(frame.offset);
    root.dataset.cols = String(cols);
    root.dataset.rows = String(rows);
    root.dataset.offset = String(frame.offset);
    root.dataset.historySize = String(frame.historySize);
    syncCacheDataset();
    syncCursorDataset();
    blinkOn = true;
    scheduler.request();
    if (textListeners.size > 0) { const text = source.read(); for (const listener of textListeners) listener(text); }
    return true;
  };

  return {
    root,
    get screen() { return canvas; },
    input,
    applyFrame,
    renderFrame: (frame) => { applyFrame(frame); },
    fit,
    measure: fit,
    metrics: () => ({ cellWidth: metrics.width, cellHeight: metrics.height }),
    size: () => ({ cols, rows }),
    read: (lines) => source.read(lines),
    rowText: (y) => source.rowText(y),
    waitForText(contains, timeoutMs) {
      const current = source.read();
      if (current.includes(contains)) return Promise.resolve(current);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          textListeners.delete(onText);
          reject(new Error(`terminal text wait timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        const onText = (text: string) => {
          if (!text.includes(contains)) return;
          clearTimeout(timer); textListeners.delete(onText); resolve(text);
        };
        textListeners.add(onText);
      });
    },
    focus() { input.focus({ preventScroll: true }); syncCursorDataset(); return focused(); },
    prepareFocusTransfer() { input.blur(); },
    refresh() { source.markAllDirty(); scheduler.cancel(); paint(true); },
    onRendered(callback) { renderedListeners.add(callback); return { dispose: () => { renderedListeners.delete(callback); } }; },
    scrollLines: (lines) => viewport.scrollLines(lines),
    scrollTo: (offset) => viewport.scrollTo(offset),
    selectionText: () => selection.text(),
    copySelection: () => selection.copy(),
    clearSelection: () => selection.clear(),
    // A composition's intermediate states are what the person is still typing; only the committed
    // text is input. The updates drive the input element so the pane sees the same events a
    // keyboard produces, and the count is what reached the terminal.
    compose: (updates, data) => {
      for (const update of updates) inputBinding.update(update);
      if (!data) { inputBinding.cancelComposition(); return 0; }
      inputBinding.commit(data);
      return 1;
    },
    paste: (text) => inputBinding.paste(text),
    renderer: () => painter.kind,
    dispose() {
      disposed = true;
      scheduler.dispose();
      stopBlink();
      stopTheme();
      stopPresentation();
      observer?.disconnect();
      inputBinding.dispose();
      selection.dispose();
      links.dispose();
      painter.dispose();
      releaseAtlas();
      input.removeEventListener("focus", onFocusChange);
      input.removeEventListener("blur", onFocusChange);
      renderedListeners.clear();
      textListeners.clear();
      canvas.remove();
      input.remove();
      preedit.remove();
    },
  };
}
