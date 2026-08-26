export interface KeyLike { key: string; code?: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }
export interface KeyState { appCursor: boolean; appKeypad: boolean; optionAsMeta: boolean }

const ESC = "\x1b";
const CURSOR: Record<string, string> = { ArrowUp: "A", ArrowDown: "B", ArrowRight: "C", ArrowLeft: "D", Home: "H", End: "F" };
const FUNCTION: Record<string, string> = { F1: "P", F2: "Q", F3: "R", F4: "S" };
const TILDE: Record<string, number> = { Insert: 2, Delete: 3, PageUp: 5, PageDown: 6, F5: 15, F6: 17, F7: 18, F8: 19, F9: 20, F10: 21, F11: 23, F12: 24 };
const KEYPAD: Record<string, string> = {
  Numpad0: "p", Numpad1: "q", Numpad2: "r", Numpad3: "s", Numpad4: "t", Numpad5: "u", Numpad6: "v", Numpad7: "w", Numpad8: "x", Numpad9: "y",
  NumpadMultiply: "j", NumpadAdd: "k", NumpadSeparator: "l", NumpadSubtract: "m", NumpadDecimal: "n", NumpadDivide: "o", NumpadEnter: "M",
};
const CONTROL_SPECIAL: Record<string, string> = { "[": "\x1b", "\\": "\x1c", "]": "\x1d", "^": "\x1e", _: "\x1f", " ": "\x00", "?": "\x7f" };

export function modifierCode(event: KeyLike): number {
  return 1 + (event.shiftKey ? 1 : 0) + (event.altKey ? 2 : 0) + (event.ctrlKey ? 4 : 0) + (event.metaKey ? 8 : 0);
}

export function encodeKey(event: KeyLike, state: KeyState): string | null {
  const mod = modifierCode(event);
  switch (event.key) {
    case "Enter": return event.altKey ? `${ESC}\r` : "\r";
    case "Backspace": return event.metaKey ? "\x15" : event.altKey ? `${ESC}\x7f` : "\x7f";
    case "Tab": return event.shiftKey ? `${ESC}[Z` : "\t";
    case "Escape": return ESC;
    default: break;
  }
  if (state.appKeypad && event.code && KEYPAD[event.code]) return `${ESC}O${KEYPAD[event.code]}`;
  const cursor = CURSOR[event.key];
  if (cursor) return mod > 1 ? `${ESC}[1;${mod}${cursor}` : state.appCursor ? `${ESC}O${cursor}` : `${ESC}[${cursor}`;
  const fn = FUNCTION[event.key];
  if (fn) return mod > 1 ? `${ESC}[1;${mod}${fn}` : `${ESC}O${fn}`;
  const tilde = TILDE[event.key];
  if (tilde) return mod > 1 ? `${ESC}[${tilde};${mod}~` : `${ESC}[${tilde}~`;
  if (Array.from(event.key).length !== 1) return null;
  if (event.metaKey) return null;
  if (event.ctrlKey) {
    const lower = event.key.toLowerCase();
    if (lower >= "a" && lower <= "z") {
      const byte = String.fromCharCode(lower.charCodeAt(0) - 96);
      return event.altKey && state.optionAsMeta ? ESC + byte : byte;
    }
    return CONTROL_SPECIAL[event.key] ?? null;
  }
  if (event.altKey) return state.optionAsMeta ? ESC + event.key : null;
  return event.key;
}
