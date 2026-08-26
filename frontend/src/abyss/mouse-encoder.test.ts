import { describe, expect, it } from "vitest";
import { defaultModes } from "./host";
import { encodeMouse } from "./mouse-encoder";

const none = { shift: false, alt: false, ctrl: false };

describe("mouse encoder", () => {
  it("encodes SGR press, release, wheel and modifiers", () => {
    const modes = { ...defaultModes(), mouseClick: true, sgrMouse: true };
    expect(encodeMouse("press", 0, 3, 4, none, modes)).toBe("\x1b[<0;3;4M");
    expect(encodeMouse("release", 0, 3, 4, none, modes)).toBe("\x1b[<0;3;4m");
    expect(encodeMouse("press", 2, 1, 1, { shift: true, alt: true, ctrl: true }, modes)).toBe("\x1b[<30;1;1M");
    expect(encodeMouse("wheel", 1, 10, 20, none, modes)).toBe("\x1b[<65;10;20M");
  });
  it("clamps X10 coordinates to one byte and uses utf-8 when enabled", () => {
    const x10 = { ...defaultModes(), mouseClick: true };
    expect(encodeMouse("press", 0, 1, 1, none, x10)).toBe("\x1b[M\x20\x21\x21");
    expect(encodeMouse("release", 1, 300, 2, none, x10)).toBe("\x1b[M\x23\xff\x22");
    const utf8 = { ...x10, utf8Mouse: true };
    expect(encodeMouse("press", 0, 300, 2, none, utf8)).toBe(`\x1b[M\x20${String.fromCodePoint(332)}\x22`);
  });
  it("gates motion by the tracking mode", () => {
    expect(encodeMouse("press", 0, 1, 1, none, defaultModes())).toBeNull();
    const click = { ...defaultModes(), mouseClick: true, sgrMouse: true };
    expect(encodeMouse("move", 0, 1, 1, none, click)).toBeNull();
    const drag = { ...click, mouseDrag: true };
    expect(encodeMouse("move", 0, 1, 1, none, drag)).toBe("\x1b[<32;1;1M");
    expect(encodeMouse("move", 3, 1, 1, none, drag)).toBeNull();
    const motion = { ...click, mouseMotion: true };
    expect(encodeMouse("move", 3, 5, 6, none, motion)).toBe("\x1b[<35;5;6M");
  });
});
