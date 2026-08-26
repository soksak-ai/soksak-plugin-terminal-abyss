import { describe, expect, it } from "vitest";
import { encodeKey, type KeyLike } from "./key-encoder";

const key = (partial: Partial<KeyLike> & { key: string }): KeyLike => ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...partial });
const plain = { appCursor: false, appKeypad: false, optionAsMeta: true };

describe("key encoder", () => {
  it("encodes control letters and control specials", () => {
    expect(encodeKey(key({ key: "c", ctrlKey: true }), plain)).toBe("\x03");
    expect(encodeKey(key({ key: "Z", ctrlKey: true, shiftKey: true }), plain)).toBe("\x1a");
    expect(encodeKey(key({ key: "[", ctrlKey: true }), plain)).toBe("\x1b");
    expect(encodeKey(key({ key: "\\", ctrlKey: true }), plain)).toBe("\x1c");
    expect(encodeKey(key({ key: "]", ctrlKey: true }), plain)).toBe("\x1d");
    expect(encodeKey(key({ key: "^", ctrlKey: true }), plain)).toBe("\x1e");
    expect(encodeKey(key({ key: "_", ctrlKey: true }), plain)).toBe("\x1f");
    expect(encodeKey(key({ key: " ", ctrlKey: true }), plain)).toBe("\x00");
    expect(encodeKey(key({ key: "?", ctrlKey: true }), plain)).toBe("\x7f");
    expect(encodeKey(key({ key: "1", ctrlKey: true }), plain)).toBeNull();
  });
  it("encodes enter, backspace, tab and escape with modifiers", () => {
    expect(encodeKey(key({ key: "Enter" }), plain)).toBe("\r");
    expect(encodeKey(key({ key: "Enter", altKey: true }), plain)).toBe("\x1b\r");
    expect(encodeKey(key({ key: "Backspace" }), plain)).toBe("\x7f");
    expect(encodeKey(key({ key: "Backspace", altKey: true }), plain)).toBe("\x1b\x7f");
    expect(encodeKey(key({ key: "Backspace", metaKey: true }), plain)).toBe("\x15");
    expect(encodeKey(key({ key: "Tab" }), plain)).toBe("\t");
    expect(encodeKey(key({ key: "Tab", shiftKey: true }), plain)).toBe("\x1b[Z");
    expect(encodeKey(key({ key: "Escape" }), plain)).toBe("\x1b");
  });
  it("encodes cursor keys in both cursor modes and with modifiers", () => {
    expect(encodeKey(key({ key: "ArrowUp" }), plain)).toBe("\x1b[A");
    expect(encodeKey(key({ key: "ArrowUp" }), { ...plain, appCursor: true })).toBe("\x1bOA");
    expect(encodeKey(key({ key: "ArrowLeft", shiftKey: true }), plain)).toBe("\x1b[1;2D");
    expect(encodeKey(key({ key: "End", ctrlKey: true, altKey: true }), { ...plain, appCursor: true })).toBe("\x1b[1;7F");
    expect(encodeKey(key({ key: "Home", metaKey: true }), plain)).toBe("\x1b[1;9H");
  });
  it("encodes editing and function keys", () => {
    expect(encodeKey(key({ key: "Insert" }), plain)).toBe("\x1b[2~");
    expect(encodeKey(key({ key: "Delete", shiftKey: true }), plain)).toBe("\x1b[3;2~");
    expect(encodeKey(key({ key: "PageUp" }), plain)).toBe("\x1b[5~");
    expect(encodeKey(key({ key: "PageDown", ctrlKey: true }), plain)).toBe("\x1b[6;5~");
    expect(encodeKey(key({ key: "F1" }), plain)).toBe("\x1bOP");
    expect(encodeKey(key({ key: "F4", shiftKey: true }), plain)).toBe("\x1b[1;2S");
    expect(encodeKey(key({ key: "F5" }), plain)).toBe("\x1b[15~");
    expect(encodeKey(key({ key: "F12", altKey: true }), plain)).toBe("\x1b[24;3~");
  });
  it("encodes the keypad only in application keypad mode", () => {
    expect(encodeKey(key({ key: "5", code: "Numpad5" }), { ...plain, appKeypad: true })).toBe("\x1bOu");
    expect(encodeKey(key({ key: "Enter", code: "NumpadEnter" }), { ...plain, appKeypad: true })).toBe("\r");
    expect(encodeKey(key({ key: "+", code: "NumpadAdd" }), { ...plain, appKeypad: true })).toBe("\x1bOk");
    expect(encodeKey(key({ key: "5", code: "Numpad5" }), plain)).toBe("5");
  });
  it("routes alt through option-as-meta and drops meta chords", () => {
    expect(encodeKey(key({ key: "a", altKey: true }), plain)).toBe("\x1ba");
    expect(encodeKey(key({ key: "a", altKey: true }), { ...plain, optionAsMeta: false })).toBeNull();
    expect(encodeKey(key({ key: "c", metaKey: true }), plain)).toBeNull();
    expect(encodeKey(key({ key: "Shift" }), plain)).toBeNull();
    expect(encodeKey(key({ key: "가" }), plain)).toBe("가");
  });
});
