# Rendering

## Renderer selection

The `renderer` setting has three values and is read once per pane when the kit asks for a
presenter; an open pane keeps its renderer.

- `dom`: the factory returns the kit's own frame presenter (`createProviderFramePresenter`), so the
  pane is the kit's DOM surface with the same `terminal-screen[/suffix]` and
  `terminal-input[/suffix]` nodes. No abyss module runs for that pane.
- `canvas` (default): the abyss pane with `CanvasPainter`.
- `webgl`: the abyss pane with `WebglPainter`; a lost WebGL context, or a failed context or shader
  setup, swaps the pane to `CanvasPainter` on a fresh canvas element. A canvas keeps the first kind
  of context it is given, so the replacement is a new canvas and the reason is published on the
  pane's root as `data-renderer-refusal`.

Canvas 2D is the default because a WebGL pane holds a rendering context of its own: measured
2026-08-26, a WebGL pane cost 20.2 MB against a Canvas 2D pane's 9.2 MB, and with six panes open
Canvas 2D applied 10 MiB of output in 1337 ms against WebGL's 4577 ms. WebGL is the faster of the
two for a single pane on an idle host, which is why it stays a setting.

## Frame model

The engine owns the screen. A frame is `{ outputSequence, cols, rows, cursor: [row, col],
cursorVisible, altActive, historySize, offset, modes, full, lines }`. `lines[]` carries
`{ y, wrapped, runs }` and a run carries `{ text, fg, bg, attrs, n, wide?, link? }`; a run covers `n`
cells (two per glyph when `wide`). Colors are `default`, `palette:N` (0..255) or `#rrggbb`; any other
grammar is a decode error. Attribute bits: 1 bold, 2 dim, 4 italic, 8 underline, 16 inverse,
32 strikeout, 64 hidden. `full: false` lists only changed rows; a delta before any full frame makes
the presenter dispatch `soksak:terminal-frame-request` on its root and apply nothing.

`frame-source.ts` stores rows by absolute index `abs = historySize - offset + y`, capped at 10000
rows. Rows above the live screen are the scrollback the presenter has seen; `read()` joins them with
the live rows. A shrinking `historySize` invalidates the selection. Theme changes re-resolve cached
rows lazily through an epoch.

## Painter backends

`painter.ts` exposes one `Painter` contract with two implementations.

- `CanvasPainter` repaints dirty rows and their neighbours: one background fill per row, then
  background runs that differ from the theme background, the selection overlay, glyphs with
  bold/italic/dim/underline/strike, the link underline, the cursor (block, underline, bar; an outline
  when the pane is unfocused) and an 8 px scrollbar while `offset > 0`. The backing store is scaled
  by the device pixel ratio and the context transform is set once per resize.
- `WebglPainter` keeps one instance buffer per row (`x y w h`, background RGBA, foreground RGBA,
  atlas uv) and re-uploads only dirty rows. Glyphs are rasterized on demand into a 2D atlas canvas
  that doubles when full and is uploaded as one texture. One atlas serves every pane drawing the
  same font at the same scale — the pixels are the same — and each painter uploads it into its own
  texture when the atlas states a generation it has not uploaded. Disposing a painter gives up the
  GL context and empties both canvases; a canvas holds its drawing buffer until it is emptied. Two instanced passes draw backgrounds and
  glyphs. `webglcontextlost` calls `onFallback`, and the pane swaps to `CanvasPainter` on a fresh
  canvas element.

## Measurement rules

`font-metrics.ts` measures the advance of `M` for the cell width and takes ascent + descent + 2 px
for the glyph box; the cell height is that box times `lineHeight`, and the baseline centres the box
in the cell. Values are snapped to the device pixel grid. `fit()` reports
`floor(root.clientWidth / cellWidth) x floor(root.clientHeight / cellHeight)`; the frame is the
authority for the painted grid, so `size()` returns the frame dimensions while `measure()` returns
the fitted ones the kit uses to request a resize. The `dom` renderer measures as the kit does.

## Scheduling

`applyFrame` applies synchronously and asks `paint-scheduler.ts` for one paint: an animation frame
while the pane is visible, a 16 ms timer while it is hidden, never both. The render sequence on the
screen node advances once per paint.
