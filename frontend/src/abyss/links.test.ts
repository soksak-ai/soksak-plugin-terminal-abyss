import { describe, expect, it, vi } from "vitest";
import { createLinks, findRunLinks, findUrlLinks } from "./links";

const cellsOf = (text: string) => Array.from(text).map((glyph) => ({ text: glyph, width: 1, link: null }));

describe("links", () => {
  it("finds urls by column, honours run links, and opens on modified click", () => {
    const cells = cellsOf("see https://example.com/a, now");
    expect(findUrlLinks(7, cells)).toEqual([{ abs: 7, start: 4, end: 25, url: "https://example.com/a" }]);
    const runs = [...cellsOf("ab"), { text: "x", width: 1, link: "https://r.example" }, { text: "y", width: 1, link: "https://r.example" }];
    expect(findRunLinks(1, runs)).toEqual([{ abs: 1, start: 2, end: 4, url: "https://r.example" }]);
    const open = vi.fn();
    const onHover = vi.fn();
    const links = createLinks({ rowCells: (abs) => (abs === 7 ? cells : []), open, onHover });
    links.hover({ abs: 7, col: 10 });
    expect(onHover).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com/a" }));
    links.hover({ abs: 7, col: 11 });
    expect(onHover).toHaveBeenCalledTimes(1);
    expect(links.activate({ abs: 7, col: 10 }, false)).toBe(false);
    expect(links.activate({ abs: 7, col: 10 }, true)).toBe(true);
    expect(open).toHaveBeenCalledWith("https://example.com/a");
    expect(links.activate({ abs: 7, col: 1 }, true)).toBe(false);
  });
});
