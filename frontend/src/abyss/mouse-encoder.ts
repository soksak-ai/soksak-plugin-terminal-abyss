import type { AbyssModes } from "./host";

export type MouseKind = "press" | "release" | "move" | "wheel";
export interface MouseMods { shift: boolean; alt: boolean; ctrl: boolean }
type MouseModes = Pick<AbyssModes, "mouseClick" | "mouseDrag" | "mouseMotion" | "sgrMouse" | "utf8Mouse">;

const coordByte = (value: number) => String.fromCharCode(Math.min(255, Math.max(1, value) + 32));
const coordUtf8 = (value: number) => String.fromCodePoint(Math.min(2015, Math.max(1, value)) + 32);

export function encodeMouse(kind: MouseKind, button: number, col1: number, row1: number, mods: MouseMods, modes: MouseModes): string | null {
  const tracking = modes.mouseClick || modes.mouseDrag || modes.mouseMotion;
  if (!tracking) return null;
  const held = button >= 0 && button <= 2;
  if (kind === "move" && !(modes.mouseMotion || (modes.mouseDrag && held))) return null;
  let b = kind === "wheel" ? 64 + (button & 1) : kind === "move" ? 32 + (held ? button : 3) : (held ? button : 3);
  if (mods.shift) b |= 4;
  if (mods.alt) b |= 8;
  if (mods.ctrl) b |= 16;
  if (modes.sgrMouse) return `\x1b[<${b};${col1};${row1}${kind === "release" ? "m" : "M"}`;
  if (kind === "release") b = (b & ~3) | 3;
  if (modes.utf8Mouse) return `\x1b[M${String.fromCharCode(b + 32)}${coordUtf8(col1)}${coordUtf8(row1)}`;
  return `\x1b[M${String.fromCharCode(b + 32)}${coordByte(col1)}${coordByte(row1)}`;
}
