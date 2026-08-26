import type { AbyssCursorStyle, AbyssRenderer, AbyssTheme, RGB } from "./host";
import { FLAG, type Cell, type FrameSource } from "./frame-source";
import { fontCss, type FontMetrics } from "./font-metrics";
import { parseCssColor, rgbCss, sameRgb } from "./palette";

export interface SelectionOverlay {
  hasSelection(): boolean;
  getSelectionCoords(abs: number): [number, number] | null;
  getDirtySelectionRows(): number[];
  clearDirtySelectionRows(): void;
}
export interface PainterView { offset: number; historySize: number }
export interface LinkHighlight { abs: number; start: number; end: number }
export interface RenderExtra { cursorOn?: boolean; link?: LinkHighlight | null }
export interface PainterOptions {
  metrics: FontMetrics;
  theme: AbyssTheme;
  devicePixelRatio: number;
  cursorStyle: AbyssCursorStyle;
  selection?: SelectionOverlay;
  onFallback?: (reason: string) => void;
  createCanvas?: () => HTMLCanvasElement;
  atlasSize?: number;
}
export interface Painter {
  readonly canvas: HTMLCanvasElement;
  readonly kind: AbyssRenderer;
  resize(cols: number, rows: number): void;
  render(source: FrameSource, forceAll: boolean, view: PainterView, focused: boolean, extra?: RenderExtra): void;
  setTheme(theme: AbyssTheme): void;
  setFont(metrics: FontMetrics): void;
  setDevicePixelRatio(dpr: number): void;
  setCursorStyle(style: AbyssCursorStyle): void;
  dispose(): void;
}

const SELECTION_ALPHA = 0.45;
const SCROLLBAR_WIDTH = 8;

function rowsToPaint(
  source: FrameSource, rows: number, forceAll: boolean, view: PainterView,
  selection: SelectionOverlay | null, lastCursorRow: number, cursorRow: number,
): number[] {
  const set = new Set<number>();
  if (forceAll || source.needsFullRedraw()) {
    for (let y = 0; y < rows; y += 1) set.add(y);
    return [...set];
  }
  for (const y of source.dirtyRows()) set.add(y);
  const base = view.historySize - view.offset;
  if (selection) for (const abs of selection.getDirtySelectionRows()) set.add(abs - base);
  if (lastCursorRow >= 0) set.add(lastCursorRow);
  if (cursorRow >= 0) set.add(cursorRow);
  for (const y of [...set]) { set.add(y - 1); set.add(y + 1); }
  return [...set].filter((y) => y >= 0 && y < rows).sort((a, b) => a - b);
}

const hasGlyph = (cell: Cell) => cell.width > 0 && cell.text !== "" && cell.text !== " " && (cell.flags & FLAG.HIDDEN) === 0;

export class CanvasPainter implements Painter {
  readonly kind: AbyssRenderer = "canvas";
  private readonly context: CanvasRenderingContext2D;
  private metrics: FontMetrics;
  private theme: AbyssTheme;
  private background: RGB;
  private dpr: number;
  private cursorStyle: AbyssCursorStyle;
  private readonly selection: SelectionOverlay | null;
  private cols = 0;
  private rows = 0;
  private lastCursorRow = -1;

  constructor(readonly canvas: HTMLCanvasElement, options: PainterOptions) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2d context unavailable");
    this.context = context;
    this.metrics = options.metrics;
    this.theme = options.theme;
    this.background = parseCssColor(options.theme.background);
    this.dpr = options.devicePixelRatio;
    this.cursorStyle = options.cursorStyle;
    this.selection = options.selection ?? null;
  }

  resize(cols: number, rows: number): void {
    this.cols = cols; this.rows = rows;
    const width = cols * this.metrics.width;
    const height = rows * this.metrics.height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.lastCursorRow = -1;
  }
  setTheme(theme: AbyssTheme): void { this.theme = theme; this.background = parseCssColor(theme.background); }
  setFont(metrics: FontMetrics): void { this.metrics = metrics; this.resize(this.cols, this.rows); }
  setDevicePixelRatio(dpr: number): void { this.dpr = dpr; this.resize(this.cols, this.rows); }
  setCursorStyle(style: AbyssCursorStyle): void { this.cursorStyle = style; }
  dispose(): void {}

  render(source: FrameSource, forceAll: boolean, view: PainterView, focused: boolean, extra: RenderExtra = {}): void {
    const { rows, cols } = this;
    if (rows <= 0 || cols <= 0) return;
    const cursor = source.getCursor();
    const cursorShown = source.isCursorVisible() && source.getModes().showCursor && view.offset === 0;
    const cursorRow = cursorShown ? cursor[0] : -1;
    const paint = rowsToPaint(source, rows, forceAll || view.offset > 0, view, this.selection, this.lastCursorRow, cursorRow);
    const base = view.historySize - view.offset;
    this.context.textBaseline = "alphabetic";
    for (const y of paint) this.paintRow(source.getLine(y), y, base + y, extra.link ?? null);
    if (cursorShown && paint.includes(cursorRow)) this.paintCursor(source.getLine(cursorRow), cursor, focused, extra.cursorOn ?? true);
    if (view.offset > 0) this.paintScrollbar(view);
    this.lastCursorRow = cursorRow;
    source.clearDirty();
    this.selection?.clearDirtySelectionRows();
  }

  private paintRow(cells: readonly Cell[], y: number, abs: number, link: LinkHighlight | null): void {
    const { context, metrics, cols } = this;
    const w = metrics.width;
    const h = metrics.height;
    const top = y * h;
    context.globalAlpha = 1;
    context.fillStyle = rgbCss(this.background);
    context.fillRect(0, top, cols * w, h);
    let index = 0;
    while (index < cells.length) {
      const bg = cells[index].bg;
      let end = index + 1;
      while (end < cells.length && sameRgb(cells[end].bg, bg)) end += 1;
      if (!sameRgb(bg, this.background)) {
        context.fillStyle = rgbCss(bg);
        context.fillRect(index * w, top, (end - index) * w, h);
      }
      index = end;
    }
    const coords = this.selection?.hasSelection() ? this.selection.getSelectionCoords(abs) : null;
    if (coords) {
      context.globalAlpha = SELECTION_ALPHA;
      context.fillStyle = this.theme.selectionBackground;
      context.fillRect(coords[0] * w, top, (Math.min(coords[1], cols) - coords[0]) * w, h);
      context.globalAlpha = 1;
    }
    for (let col = 0; col < cells.length; col += 1) {
      const cell = cells[col];
      if (cell.width === 0) continue;
      const flags = cell.flags;
      const glyph = hasGlyph(cell);
      const decorated = (flags & (FLAG.UNDERLINE | FLAG.STRIKE)) !== 0;
      if (!glyph && !decorated) continue;
      context.fillStyle = rgbCss(cell.fg);
      if (flags & FLAG.DIM) context.globalAlpha = 0.5;
      if (glyph) {
        context.font = fontCss(metrics, (flags & FLAG.BOLD) !== 0, (flags & FLAG.ITALIC) !== 0);
        context.fillText(cell.text, col * w, top + metrics.baseline);
      }
      if (flags & FLAG.UNDERLINE) context.fillRect(col * w, top + metrics.baseline + 2, cell.width * w, 1);
      if (flags & FLAG.STRIKE) context.fillRect(col * w, top + Math.round(metrics.baseline * 0.66), cell.width * w, 1);
      if (flags & FLAG.DIM) context.globalAlpha = 1;
    }
    if (link && link.abs === abs) {
      context.fillStyle = this.theme.foreground;
      context.fillRect(link.start * w, top + metrics.baseline + 2, (link.end - link.start) * w, 1);
    }
  }

  private paintCursor(cells: readonly Cell[], cursor: [number, number], focused: boolean, cursorOn: boolean): void {
    const { context, metrics } = this;
    const [row, col] = cursor;
    const cell = cells[col];
    const width = (cell?.width === 2 ? 2 : 1) * metrics.width;
    const x = col * metrics.width;
    const top = row * metrics.height;
    context.globalAlpha = 1;
    if (!focused) {
      context.strokeStyle = this.theme.cursor;
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, top + 0.5, width - 1, metrics.height - 1);
      return;
    }
    if (!cursorOn) return;
    context.fillStyle = this.theme.cursor;
    if (this.cursorStyle === "block") {
      context.fillRect(x, top, width, metrics.height);
      if (cell && hasGlyph(cell)) {
        context.fillStyle = this.theme.cursorAccent;
        context.font = fontCss(metrics, (cell.flags & FLAG.BOLD) !== 0, (cell.flags & FLAG.ITALIC) !== 0);
        context.fillText(cell.text, x, top + metrics.baseline);
      }
    } else if (this.cursorStyle === "underline") {
      context.fillRect(x, top + metrics.height - 2, width, 2);
    } else {
      context.fillRect(x, top, 2, metrics.height);
    }
  }

  private paintScrollbar(view: PainterView): void {
    const { context, metrics, rows, cols } = this;
    const height = rows * metrics.height;
    const width = cols * metrics.width;
    const total = view.historySize + rows;
    const thumb = Math.max(20, (height * rows) / total);
    const thumbTop = ((view.historySize - view.offset) / total) * height;
    context.fillStyle = this.theme.foreground;
    context.globalAlpha = 0.15;
    context.fillRect(width - SCROLLBAR_WIDTH, 0, SCROLLBAR_WIDTH, height);
    context.globalAlpha = 0.5;
    context.fillRect(width - SCROLLBAR_WIDTH + 1, thumbTop, SCROLLBAR_WIDTH - 2, thumb);
    context.globalAlpha = 1;
  }
}

export const VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec4 aRect;
layout(location=1) in vec4 aBg;
layout(location=2) in vec4 aFg;
layout(location=3) in vec4 aUv;
uniform vec2 uResolution;
uniform int uPass;
out vec2 vUv;
out vec4 vColor;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vec2 px = aRect.xy + corner * aRect.zw;
  vec2 clip = px / uResolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUv = mix(aUv.xy, aUv.zw, corner);
  vColor = uPass == 0 ? aBg : aFg;
}`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAtlas;
uniform int uPass;
in vec2 vUv;
in vec4 vColor;
out vec4 outColor;
void main() {
  if (uPass == 0) { outColor = vColor; return; }
  float alpha = texture(uAtlas, vUv).a;
  outColor = vec4(vColor.rgb, vColor.a * alpha);
}`;

const FLOATS_PER_INSTANCE = 16;
const INSTANCE_BYTES = FLOATS_PER_INSTANCE * 4;

interface AtlasEntry { x: number; y: number; w: number; h: number }
interface AtlasKey { text: string; bold: boolean; italic: boolean; cells: number }

class GlyphAtlas {
  canvas: HTMLCanvasElement;
  size: number;
  dirty = false;
  private context: CanvasRenderingContext2D;
  private entries = new Map<string, AtlasEntry>();
  private keys: AtlasKey[] = [];
  private x = 0;
  private y = 0;
  private rowHeight = 0;

  constructor(size: number, private metrics: FontMetrics, private dpr: number, private readonly createCanvas: () => HTMLCanvasElement) {
    this.size = size;
    this.canvas = createCanvas();
    this.context = this.contextOf(this.canvas, size);
  }

  get glyphCount(): number { return this.entries.size; }

  reset(metrics: FontMetrics, dpr: number): void {
    this.metrics = metrics; this.dpr = dpr;
    this.entries.clear(); this.keys = [];
    this.x = 0; this.y = 0; this.rowHeight = 0;
    this.context.clearRect(0, 0, this.size, this.size);
    this.dirty = true;
  }

  lookup(text: string, bold: boolean, italic: boolean, cells: number): AtlasEntry {
    const key = `${bold ? "b" : "-"}${italic ? "i" : "-"}${cells}${text}`;
    const found = this.entries.get(key);
    if (found) return found;
    const w = Math.ceil(this.metrics.width * cells * this.dpr) + 2;
    const h = Math.ceil(this.metrics.height * this.dpr) + 2;
    while (!this.fits(w, h)) this.grow();
    const entry = this.place(w, h);
    this.rasterize(entry, text, bold, italic);
    this.entries.set(key, entry);
    this.keys.push({ text, bold, italic, cells });
    this.dirty = true;
    return entry;
  }

  private contextOf(canvas: HTMLCanvasElement, size: number): CanvasRenderingContext2D {
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("atlas needs a 2d context");
    return context;
  }
  private fits(w: number, h: number): boolean {
    if (w > this.size || h > this.size) return false;
    if (this.x + w <= this.size && this.y + h <= this.size) return true;
    return this.y + this.rowHeight + h <= this.size;
  }
  private place(w: number, h: number): AtlasEntry {
    if (this.x + w > this.size) { this.x = 0; this.y += this.rowHeight; this.rowHeight = 0; }
    const entry = { x: this.x, y: this.y, w, h };
    this.x += w;
    this.rowHeight = Math.max(this.rowHeight, h);
    return entry;
  }
  private rasterize(entry: AtlasEntry, text: string, bold: boolean, italic: boolean): void {
    const context = this.context;
    context.clearRect(entry.x, entry.y, entry.w, entry.h);
    context.save();
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.font = fontCss(this.metrics, bold, italic);
    context.textBaseline = "alphabetic";
    context.fillStyle = "#ffffff";
    context.fillText(text, (entry.x + 1) / this.dpr, (entry.y + 1) / this.dpr + this.metrics.baseline);
    context.restore();
  }
  private grow(): void {
    const keys = this.keys;
    this.size *= 2;
    this.canvas = this.createCanvas();
    this.context = this.contextOf(this.canvas, this.size);
    this.entries.clear(); this.keys = [];
    this.x = 0; this.y = 0; this.rowHeight = 0;
    for (const key of keys) this.lookup(key.text, key.bold, key.italic, key.cells);
    this.dirty = true;
  }
}

interface RowBuffer { buffer: WebGLBuffer; count: number }

export class WebglPainter implements Painter {
  readonly kind: AbyssRenderer = "webgl";
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly texture: WebGLTexture;
  private readonly resolutionLocation: WebGLUniformLocation | null;
  private readonly passLocation: WebGLUniformLocation | null;
  private readonly atlas: GlyphAtlas;
  private readonly rowBuffers = new Map<number, RowBuffer>();
  private readonly overlay: RowBuffer;
  private readonly selection: SelectionOverlay | null;
  private readonly onLost: (event: Event) => void;
  private metrics: FontMetrics;
  private theme: AbyssTheme;
  private background: RGB;
  private dpr: number;
  private cursorStyle: AbyssCursorStyle;
  private cols = 0;
  private rows = 0;
  private lastCursorRow = -1;
  private lost = false;
  private uploads = 0;

  constructor(readonly canvas: HTMLCanvasElement, options: PainterOptions) {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error("webgl2 context unavailable");
    this.gl = gl;
    this.metrics = options.metrics;
    this.theme = options.theme;
    this.background = parseCssColor(options.theme.background);
    this.dpr = options.devicePixelRatio;
    this.cursorStyle = options.cursorStyle;
    this.selection = options.selection ?? null;
    const createCanvas = options.createCanvas ?? (() => canvas.ownerDocument.createElement("canvas"));
    this.atlas = new GlyphAtlas(options.atlasSize ?? 1024, options.metrics, this.dpr, createCanvas);
    this.program = this.link();
    const vao = gl.createVertexArray();
    const texture = gl.createTexture();
    const overlayBuffer = gl.createBuffer();
    if (!vao || !texture || !overlayBuffer) throw new Error("webgl2 allocation failed");
    this.vao = vao;
    this.texture = texture;
    this.overlay = { buffer: overlayBuffer, count: 0 };
    this.resolutionLocation = gl.getUniformLocation(this.program, "uResolution");
    this.passLocation = gl.getUniformLocation(this.program, "uPass");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.onLost = (event) => {
      event.preventDefault();
      this.lost = true;
      options.onFallback?.("webgl context lost");
    };
    canvas.addEventListener("webglcontextlost", this.onLost);
  }

  debug(): { atlasSize: number; glyphs: number; uploads: number; rowBuffers: number } {
    return { atlasSize: this.atlas.size, glyphs: this.atlas.glyphCount, uploads: this.uploads, rowBuffers: this.rowBuffers.size };
  }

  resize(cols: number, rows: number): void {
    this.cols = cols; this.rows = rows;
    const width = cols * this.metrics.width;
    const height = rows * this.metrics.height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    for (const y of [...this.rowBuffers.keys()]) if (y >= rows) { this.gl.deleteBuffer(this.rowBuffers.get(y)!.buffer); this.rowBuffers.delete(y); }
    this.lastCursorRow = -1;
  }
  setTheme(theme: AbyssTheme): void { this.theme = theme; this.background = parseCssColor(theme.background); }
  setFont(metrics: FontMetrics): void { this.metrics = metrics; this.atlas.reset(metrics, this.dpr); this.resize(this.cols, this.rows); }
  setDevicePixelRatio(dpr: number): void { this.dpr = dpr; this.atlas.reset(this.metrics, dpr); this.resize(this.cols, this.rows); }
  setCursorStyle(style: AbyssCursorStyle): void { this.cursorStyle = style; }

  dispose(): void {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    const gl = this.gl;
    for (const row of this.rowBuffers.values()) gl.deleteBuffer(row.buffer);
    this.rowBuffers.clear();
    gl.deleteBuffer(this.overlay.buffer);
    gl.deleteTexture(this.texture);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }

  render(source: FrameSource, forceAll: boolean, view: PainterView, focused: boolean, extra: RenderExtra = {}): void {
    if (this.lost || this.rows <= 0 || this.cols <= 0) return;
    const gl = this.gl;
    const cursor = source.getCursor();
    const cursorShown = source.isCursorVisible() && source.getModes().showCursor && view.offset === 0;
    const cursorRow = cursorShown ? cursor[0] : -1;
    const paint = rowsToPaint(source, this.rows, forceAll || view.offset > 0, view, this.selection, this.lastCursorRow, cursorRow);
    const base = view.historySize - view.offset;
    for (const y of paint) this.uploadRow(y, source.getLine(y), base + y, extra.link ?? null);
    const overlay = this.buildOverlay(source, view, cursorShown, cursor, focused, extra.cursorOn ?? true);
    if (overlay.length > 0 || this.overlay.count > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.overlay.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, overlay, gl.DYNAMIC_DRAW);
      this.overlay.count = overlay.length / FLOATS_PER_INSTANCE;
    }
    if (this.atlas.dirty) {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas);
      this.atlas.dirty = false;
      this.uploads += 1;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(this.background[0] / 255, this.background[1] / 255, this.background[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
    for (const pass of [0, 1]) {
      gl.uniform1i(this.passLocation, pass);
      for (let y = 0; y < this.rows; y += 1) {
        const row = this.rowBuffers.get(y);
        if (row && row.count > 0) this.draw(row);
      }
      if (this.overlay.count > 0) this.draw(this.overlay);
    }
    this.lastCursorRow = cursorRow;
    source.clearDirty();
    this.selection?.clearDirtySelectionRows();
  }

  private link(): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, body: string): WebGLShader => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("shader allocation failed");
      gl.shaderSource(shader, body);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader compile failed: ${gl.getShaderInfoLog(shader) ?? ""}`);
      return shader;
    };
    const program = gl.createProgram();
    if (!program) throw new Error("program allocation failed");
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`program link failed: ${gl.getProgramInfoLog(program) ?? ""}`);
    return program;
  }

  private draw(row: RowBuffer): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, row.buffer);
    for (let slot = 0; slot < 4; slot += 1) {
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot, 4, gl.FLOAT, false, INSTANCE_BYTES, slot * 16);
      gl.vertexAttribDivisor(slot, 1);
    }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, row.count);
  }

  private push(out: number[], x: number, y: number, w: number, h: number, bg: RGB, bgAlpha: number, fg: RGB, fgAlpha: number, entry: AtlasEntry | null): void {
    const size = this.atlas.size;
    const dpr = this.dpr;
    out.push(
      x * dpr, y * dpr, w * dpr, h * dpr,
      bg[0] / 255, bg[1] / 255, bg[2] / 255, bgAlpha,
      fg[0] / 255, fg[1] / 255, fg[2] / 255, fgAlpha,
      entry ? entry.x / size : 0, entry ? entry.y / size : 0,
      entry ? (entry.x + entry.w) / size : 0, entry ? (entry.y + entry.h) / size : 0,
    );
  }

  private uploadRow(y: number, cells: readonly Cell[], abs: number, link: LinkHighlight | null): void {
    const gl = this.gl;
    const { metrics } = this;
    const w = metrics.width;
    const h = metrics.height;
    const top = y * h;
    const out: number[] = [];
    const none: RGB = [0, 0, 0];
    for (let col = 0; col < cells.length; col += 1) {
      const cell = cells[col];
      if (cell.width === 0) continue;
      const flags = cell.flags;
      const glyph = hasGlyph(cell);
      const bgShown = !sameRgb(cell.bg, this.background);
      const fgAlpha = flags & FLAG.DIM ? 0.5 : 1;
      if (glyph) {
        const entry = this.atlas.lookup(cell.text, (flags & FLAG.BOLD) !== 0, (flags & FLAG.ITALIC) !== 0, cell.width);
        const gw = entry.w / this.dpr;
        const gh = entry.h / this.dpr;
        this.push(out, col * w - 1 / this.dpr, top - 1 / this.dpr, gw, gh, cell.bg, bgShown ? 1 : 0, cell.fg, fgAlpha, entry);
        if (bgShown) this.push(out, col * w, top, cell.width * w, h, cell.bg, 1, none, 0, null);
      } else if (bgShown) {
        this.push(out, col * w, top, cell.width * w, h, cell.bg, 1, none, 0, null);
      }
      if (flags & FLAG.UNDERLINE) this.push(out, col * w, top + metrics.baseline + 2, cell.width * w, 1, cell.fg, fgAlpha, none, 0, null);
      if (flags & FLAG.STRIKE) this.push(out, col * w, top + Math.round(metrics.baseline * 0.66), cell.width * w, 1, cell.fg, fgAlpha, none, 0, null);
    }
    const coords = this.selection?.hasSelection() ? this.selection.getSelectionCoords(abs) : null;
    if (coords) {
      const end = Math.min(coords[1], this.cols);
      this.push(out, coords[0] * w, top, (end - coords[0]) * w, h, parseCssColor(this.theme.selectionBackground), SELECTION_ALPHA, none, 0, null);
    }
    if (link && link.abs === abs) {
      this.push(out, link.start * w, top + metrics.baseline + 2, (link.end - link.start) * w, 1, parseCssColor(this.theme.foreground), 1, none, 0, null);
    }
    let row = this.rowBuffers.get(y);
    if (!row) {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("row buffer allocation failed");
      row = { buffer, count: 0 };
      this.rowBuffers.set(y, row);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, row.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);
    row.count = out.length / FLOATS_PER_INSTANCE;
  }

  private buildOverlay(source: FrameSource, view: PainterView, cursorShown: boolean, cursor: [number, number], focused: boolean, cursorOn: boolean): Float32Array {
    const out: number[] = [];
    const none: RGB = [0, 0, 0];
    const { metrics, rows, cols } = this;
    const w = metrics.width;
    const h = metrics.height;
    if (cursorShown) {
      const [row, col] = cursor;
      const cells = source.getLine(row);
      const cell = cells[col];
      const width = (cell?.width === 2 ? 2 : 1) * w;
      const x = col * w;
      const top = row * h;
      const color = parseCssColor(this.theme.cursor);
      if (!focused) {
        this.push(out, x, top, width, 1, color, 1, none, 0, null);
        this.push(out, x, top + h - 1, width, 1, color, 1, none, 0, null);
        this.push(out, x, top, 1, h, color, 1, none, 0, null);
        this.push(out, x + width - 1, top, 1, h, color, 1, none, 0, null);
      } else if (cursorOn) {
        if (this.cursorStyle === "block") {
          this.push(out, x, top, width, h, color, 1, none, 0, null);
          if (cell && hasGlyph(cell)) {
            const entry = this.atlas.lookup(cell.text, (cell.flags & FLAG.BOLD) !== 0, (cell.flags & FLAG.ITALIC) !== 0, cell.width);
            this.push(out, x - 1 / this.dpr, top - 1 / this.dpr, entry.w / this.dpr, entry.h / this.dpr, none, 0, parseCssColor(this.theme.cursorAccent), 1, entry);
          }
        } else if (this.cursorStyle === "underline") {
          this.push(out, x, top + h - 2, width, 2, color, 1, none, 0, null);
        } else {
          this.push(out, x, top, 2, h, color, 1, none, 0, null);
        }
      }
    }
    if (view.offset > 0) {
      const height = rows * h;
      const width = cols * w;
      const total = view.historySize + rows;
      const thumb = Math.max(20, (height * rows) / total);
      const thumbTop = ((view.historySize - view.offset) / total) * height;
      const color = parseCssColor(this.theme.foreground);
      this.push(out, width - SCROLLBAR_WIDTH, 0, SCROLLBAR_WIDTH, height, color, 0.15, none, 0, null);
      this.push(out, width - SCROLLBAR_WIDTH + 1, thumbTop, SCROLLBAR_WIDTH - 2, thumb, color, 0.5, none, 0, null);
    }
    return new Float32Array(out);
  }
}

// A canvas keeps the first kind of context it is given. A WebGL painter that took its context and
// then failed leaves a canvas the 2d painter cannot use, so the reason travels to the caller, which
// owns where the replacement canvas goes.
export function createPainter(kind: AbyssRenderer, canvas: HTMLCanvasElement, options: PainterOptions): Painter {
  if (kind === "webgl") {
    try { return new WebglPainter(canvas, options); }
    catch (reason) { options.onFallback?.(reason instanceof Error ? reason.message : String(reason)); }
  }
  return new CanvasPainter(canvas, options);
}
