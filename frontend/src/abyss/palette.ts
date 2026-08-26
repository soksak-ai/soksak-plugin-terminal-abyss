import type { AbyssTheme, RGB } from "./host";

export type ColorRole = "fg" | "bg";

const HEX6 = /^#([0-9a-f]{6})$/i;
const HEX3 = /^#([0-9a-f]{3})$/i;
const RGB_FN = /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i;

export function parseCssColor(value: string): RGB {
  const trimmed = value.trim();
  const six = HEX6.exec(trimmed);
  if (six) { const n = parseInt(six[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const three = HEX3.exec(trimmed);
  if (three) return [parseInt(three[1][0].repeat(2), 16), parseInt(three[1][1].repeat(2), 16), parseInt(three[1][2].repeat(2), 16)];
  const fn = RGB_FN.exec(trimmed);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  throw new Error(`invalid css color ${value}`);
}

export function rgbCss(rgb: RGB): string { return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; }
export function rgbaCss(rgb: RGB, alpha: number): string { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`; }
export function sameRgb(a: RGB, b: RGB): boolean { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }

export function resolveColor(value: string, theme: AbyssTheme, role: ColorRole, bold: boolean): RGB {
  if (value === "default") return parseCssColor(role === "fg" ? theme.foreground : theme.background);
  if (value.startsWith("#")) return parseCssColor(value);
  if (value.startsWith("palette:")) {
    const raw = value.slice("palette:".length);
    if (!/^\d{1,3}$/.test(raw)) throw new Error(`invalid palette index ${value}`);
    let index = Number(raw);
    if (index > 255) throw new Error(`invalid palette index ${value}`);
    if (bold && role === "fg" && index < 8) index += 8;
    const entry = theme.ansi[index];
    if (!entry) throw new Error(`theme has no palette entry ${index}`);
    return parseCssColor(entry);
  }
  throw new Error(`unknown color grammar ${value}`);
}

export interface ColorCache {
  resolve(value: string, role: ColorRole, bold: boolean): RGB;
  invalidate(): void;
}

export function createColorCache(theme: () => AbyssTheme): ColorCache {
  const cache = new Map<string, RGB>();
  return {
    resolve(value, role, bold) {
      const key = `${role}${bold ? "!" : "."}${value}`;
      let color = cache.get(key);
      if (!color) { color = resolveColor(value, theme(), role, bold); cache.set(key, color); }
      return color;
    },
    invalidate() { cache.clear(); },
  };
}
