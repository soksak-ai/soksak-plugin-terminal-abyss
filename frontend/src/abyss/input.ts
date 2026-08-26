import type { AbyssModes } from "./host";
import { attachComposition, isCompositionKeydown } from "./composition";
import { encodeKey } from "./key-encoder";
import type { LinksController } from "./links";
import { encodeMouse } from "./mouse-encoder";
import type { SelectionController } from "./selection";
import type { Viewport } from "./viewport";

export interface InputOptions {
  root: HTMLElement;
  input: HTMLTextAreaElement;
  send(text: string): void;
  modes(): AbyssModes;
  altActive(): boolean;
  appCursor(): boolean;
  optionAsMeta(): boolean;
  cell(): { width: number; height: number };
  rows(): number;
  viewport: Viewport;
  selection: SelectionController;
  links: LinksController;
  now(): number;
  onActivity?(): void;
}
export interface InputBinding { accept(text: string): void; acceptedInputSequence(): number; paste(text: string): void; dispose(): void }

export function bindInput(options: InputOptions): InputBinding {
  const { root, input } = options;
  let sequence = 0;
  let lastKeydown: { text: string; at: number } | null = null;
  let heldButton: number | null = null;
  let lastMouseCell = "";
  const accept = (text: string) => {
    if (!text) return;
    sequence += 1;
    input.dataset.acceptedInputSequence = String(sequence);
    options.onActivity?.();
    options.send(text);
  };
  const tracking = () => { const m = options.modes(); return m.mouseClick || m.mouseDrag || m.mouseMotion; };
  const mods = (event: MouseEvent) => ({ shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey });
  const composition = attachComposition(input, {
    emit: accept, bracketedPaste: () => options.modes().bracketedPaste, now: options.now, lastKeydown: () => lastKeydown,
  });

  const onKeydown = (event: KeyboardEvent) => {
    if (isCompositionKeydown(event)) return;
    if (event.shiftKey && !options.altActive() && (event.key === "PageUp" || event.key === "PageDown")) {
      event.preventDefault();
      options.viewport.scrollLines(event.key === "PageUp" ? -options.rows() : options.rows());
      return;
    }
    const encoded = encodeKey(event, { appCursor: options.appCursor(), appKeypad: options.modes().appKeypad, optionAsMeta: options.optionAsMeta() });
    if (encoded === null) return;
    event.preventDefault();
    lastKeydown = { text: encoded, at: options.now() };
    options.selection.clear();
    if (options.viewport.target() > 0 && !options.altActive()) options.viewport.toBottom();
    accept(encoded);
  };
  const onMousedown = (event: MouseEvent) => {
    if (event.button === 0) event.preventDefault();
    input.focus({ preventScroll: true });
  };
  const onPointerDown = (event: PointerEvent) => {
    const point = options.selection.cellFromPoint(event.clientX, event.clientY);
    if (tracking() && !event.shiftKey) {
      const encoded = encodeMouse("press", event.button, point.col + 1, point.row + 1, mods(event), options.modes());
      if (encoded) { heldButton = event.button; lastMouseCell = `${point.col},${point.row}`; accept(encoded); }
      return;
    }
    if (event.button === 0 && options.links.activate(point, event.metaKey || event.ctrlKey)) return;
    options.selection.pointerDown(event);
  };
  const onPointerMove = (event: PointerEvent) => {
    const point = options.selection.cellFromPoint(event.clientX, event.clientY);
    if (tracking() && !event.shiftKey) {
      const key = `${point.col},${point.row}`;
      if (key === lastMouseCell) return;
      lastMouseCell = key;
      const encoded = encodeMouse("move", heldButton ?? 3, point.col + 1, point.row + 1, mods(event), options.modes());
      if (encoded) accept(encoded);
      return;
    }
    if (options.selection.isDragging()) options.selection.pointerMove(event);
    else options.links.hover(point);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (heldButton !== null) {
      const point = options.selection.cellFromPoint(event.clientX, event.clientY);
      const encoded = encodeMouse("release", heldButton, point.col + 1, point.row + 1, mods(event), options.modes());
      heldButton = null;
      if (encoded) accept(encoded);
      return;
    }
    options.selection.pointerUp(event);
  };
  const onPointerLeave = () => options.links.hover(null);
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const lines = options.viewport.wheelLines(event, options.cell().height);
    if (lines === 0) return;
    const count = Math.abs(lines);
    if (tracking() && !event.shiftKey) {
      const point = options.selection.cellFromPoint(event.clientX, event.clientY);
      const encoded = encodeMouse("wheel", lines < 0 ? 0 : 1, point.col + 1, point.row + 1, mods(event), options.modes());
      if (encoded) accept(encoded.repeat(count));
      return;
    }
    if (options.altActive() && options.modes().alternateScroll) {
      const arrow = options.appCursor() ? (lines < 0 ? "\x1bOA" : "\x1bOB") : (lines < 0 ? "\x1b[A" : "\x1b[B");
      accept(arrow.repeat(count));
      return;
    }
    options.viewport.scrollLines(lines);
  };
  const onFocus = () => { if (options.modes().focusInOut) accept("\x1b[I"); };
  const onBlur = () => { if (options.modes().focusInOut) accept("\x1b[O"); };

  input.addEventListener("keydown", onKeydown);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  root.addEventListener("mousedown", onMousedown);
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointerleave", onPointerLeave);
  root.addEventListener("wheel", onWheel, { passive: false });
  return {
    accept,
    acceptedInputSequence: () => sequence,
    paste: (text) => composition.paste(text),
    dispose() {
      composition.dispose();
      input.removeEventListener("keydown", onKeydown);
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("blur", onBlur);
      root.removeEventListener("mousedown", onMousedown);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("pointerleave", onPointerLeave);
      root.removeEventListener("wheel", onWheel);
    },
  };
}
