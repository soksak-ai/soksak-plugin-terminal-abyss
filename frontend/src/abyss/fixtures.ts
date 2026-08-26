import { defaultModes, type AbyssFrame, type AbyssLine, type AbyssModes, type AbyssTheme } from "./host";

export function themeFixture(): AbyssTheme {
  const ansi: string[] = [];
  for (let index = 0; index < 256; index += 1) {
    const channel = (index * 7 % 256).toString(16).padStart(2, "0");
    ansi.push(`#${channel}${(index % 256).toString(16).padStart(2, "0")}${channel}`);
  }
  ansi[1] = "#cc0000"; ansi[9] = "#ef2929";
  return { foreground: "#eeeeec", background: "#1e1e1e", cursor: "#ffffff", cursorAccent: "#1e1e1e", selectionBackground: "#555753", selectionForeground: "#eeeeec", ansi };
}

export function lineFixture(y: number, text: string, attrs = 0, fg = "default", bg = "default"): AbyssLine {
  return { y, wrapped: false, runs: [{ text, fg, bg, attrs, n: Array.from(text).length, wide: false, link: null }] };
}

export function frameFixture(overrides: Partial<AbyssFrame> & { modes?: Partial<AbyssModes> } = {}): AbyssFrame {
  const { modes, ...rest } = overrides;
  return {
    outputSequence: 1, cols: 8, rows: 2, cursor: [0, 0], cursorVisible: false, altActive: false,
    historySize: 0, offset: 0, modes: { ...defaultModes(), ...modes }, full: true,
    lines: [lineFixture(0, "ab"), lineFixture(1, "cd")],
    ...rest,
  };
}
