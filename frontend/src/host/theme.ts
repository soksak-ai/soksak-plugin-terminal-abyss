import { TERMINAL_ANSI_PALETTE, TERMINAL_THEME_CONTRACT } from "@soksak/soksak-contract-plugin-terminal";
import { bindTerminalThemeSurface, observeTerminalTheme, readTerminalTheme } from "@soksak/soksak-kit-plugin-terminal";
import type { AbyssTheme } from "../abyss/host";

export function bindAbyssThemeSurface(root: HTMLElement): void {
  bindTerminalThemeSurface(root);
}

export function readAbyssTheme(root: HTMLElement): AbyssTheme {
  const themeRoot = root.ownerDocument.documentElement;
  const resolved = readTerminalTheme(themeRoot);
  const style = getComputedStyle(root);
  const ansi = TERMINAL_ANSI_PALETTE.map((fallback, index) => {
    const declared = style.getPropertyValue(`${TERMINAL_THEME_CONTRACT.properties.ansiPrefix}${index}`).trim();
    return declared || fallback;
  });
  return { ...resolved, selectionForeground: resolved.foreground, ansi };
}

export function observeAbyssTheme(root: HTMLElement, onChange: () => void): () => void {
  return observeTerminalTheme(root.ownerDocument.documentElement, onChange);
}
