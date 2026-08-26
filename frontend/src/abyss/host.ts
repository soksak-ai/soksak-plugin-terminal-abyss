export type RGB = readonly [number, number, number];

export interface AbyssModes {
  bracketedPaste: boolean; appCursor: boolean; appKeypad: boolean;
  mouseClick: boolean; mouseDrag: boolean; mouseMotion: boolean;
  sgrMouse: boolean; utf8Mouse: boolean; focusInOut: boolean;
  alternateScroll: boolean; showCursor: boolean; lineWrap: boolean; insert: boolean;
}

export const MODE_KEYS: readonly (keyof AbyssModes)[] = [
  "bracketedPaste", "appCursor", "appKeypad", "mouseClick", "mouseDrag", "mouseMotion",
  "sgrMouse", "utf8Mouse", "focusInOut", "alternateScroll", "showCursor", "lineWrap", "insert",
];

export function defaultModes(): AbyssModes {
  return {
    bracketedPaste: false, appCursor: false, appKeypad: false, mouseClick: false, mouseDrag: false,
    mouseMotion: false, sgrMouse: false, utf8Mouse: false, focusInOut: false, alternateScroll: false,
    showCursor: true, lineWrap: true, insert: false,
  };
}

export interface AbyssRun { text: string; fg: string; bg: string; attrs: number; n: number; wide: boolean; link: string | null }
export interface AbyssLine { y: number; wrapped: boolean; runs: AbyssRun[] }
export interface AbyssFrame {
  outputSequence: number; cols: number; rows: number; cursor: [number, number];
  cursorVisible: boolean; altActive: boolean; historySize: number; offset: number;
  modes: AbyssModes; full: boolean; lines: AbyssLine[];
}

export interface AbyssTheme {
  foreground: string; background: string; cursor: string; cursorAccent: string;
  selectionBackground: string; selectionForeground: string; ansi: string[];
}

export type AbyssCursorStyle = "block" | "underline" | "bar";
export type AbyssRenderer = "webgl" | "canvas";

export interface AbyssSettings {
  fontFamily: string; fontSize: number; lineHeight: number; cursorStyle: AbyssCursorStyle;
  cursorBlink: boolean; optionAsMeta: boolean; scrollLines: number; renderer: AbyssRenderer;
}

export interface AbyssPresentation { visible: boolean }

export interface AbyssHost {
  theme(): AbyssTheme;
  onThemeChange(callback: () => void): () => void;
  presentation(): AbyssPresentation;
  onPresentationChange(callback: (presentation: AbyssPresentation) => void): () => void;
  clipboard: { writeText(text: string): Promise<void> };
  openUrl(url: string): void;
  settings: AbyssSettings;
  devicePixelRatio(): number;
  now(): number;
}
