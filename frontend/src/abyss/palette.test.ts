import { describe, expect, it } from "vitest";
import { themeFixture } from "./fixtures";
import { createColorCache, parseCssColor, resolveColor } from "./palette";

const theme = themeFixture();

describe("palette", () => {
  it("resolves default by role", () => {
    expect(resolveColor("default", theme, "fg", false)).toEqual([0xee, 0xee, 0xec]);
    expect(resolveColor("default", theme, "bg", true)).toEqual([0x1e, 0x1e, 0x1e]);
  });
  it("bumps a bold palette color below 8 for the foreground only", () => {
    expect(resolveColor("palette:1", theme, "fg", true)).toEqual([0xef, 0x29, 0x29]);
    expect(resolveColor("palette:1", theme, "fg", false)).toEqual([0xcc, 0, 0]);
    expect(resolveColor("palette:1", theme, "bg", true)).toEqual([0xcc, 0, 0]);
    expect(resolveColor("palette:9", theme, "fg", true)).toEqual([0xef, 0x29, 0x29]);
  });
  it("parses hex and rgb() colors", () => {
    expect(resolveColor("#10a0ff", theme, "fg", false)).toEqual([0x10, 0xa0, 0xff]);
    expect(parseCssColor("rgb(1, 2, 3)")).toEqual([1, 2, 3]);
    expect(parseCssColor("#abc")).toEqual([0xaa, 0xbb, 0xcc]);
  });
  it("throws on unknown grammar and caches until invalidated", () => {
    expect(() => resolveColor("red", theme, "fg", false)).toThrow("unknown color grammar");
    expect(() => resolveColor("palette:256", theme, "fg", false)).toThrow("invalid palette index");
    let current = theme;
    const cache = createColorCache(() => current);
    expect(cache.resolve("default", "fg", false)).toEqual([0xee, 0xee, 0xec]);
    current = { ...theme, foreground: "#000000" };
    expect(cache.resolve("default", "fg", false)).toEqual([0xee, 0xee, 0xec]);
    cache.invalidate();
    expect(cache.resolve("default", "fg", false)).toEqual([0, 0, 0]);
  });
});
