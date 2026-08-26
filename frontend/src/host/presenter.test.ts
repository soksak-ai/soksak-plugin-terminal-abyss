import { describe, expect, it, vi } from "vitest";
import { createAbyssPresenter } from "./presenter";
import { readAbyssSettings, readRendererSetting } from "./settings";

function rootFixture() {
  const root = document.createElement("div");
  Object.defineProperty(root, "clientWidth", { value: 700 });
  Object.defineProperty(root, "clientHeight", { value: 180 });
  document.body.append(root);
  return root;
}
const appWith = (values: Record<string, unknown>) => ({ settings: { get: (key: string) => values[key] } });

describe("presenter factory", () => {
  it("renderer=dom returns the kit presenter (no canvas node)", () => {
    const root = rootFixture();
    const send = vi.fn();
    const presenter = createAbyssPresenter(appWith({ renderer: "dom" }))(root, send, { nodeSuffix: null });
    expect(root.querySelector("canvas")).toBeNull();
    expect(root.querySelector('[data-node="terminal-screen"]')).not.toBeNull();
    expect(root.querySelector('[data-node="terminal-input"]')).not.toBeNull();
    expect(presenter.renderer()).toBe("dom");
    expect(typeof presenter.applyFrame).toBe("function");
    expect(typeof presenter.read).toBe("function");
    presenter.dispose();
  });
  it("renderer=canvas and the default return an abyss pane with a canvas screen", () => {
    const canvas = createAbyssPresenter(appWith({ renderer: "canvas" }))(rootFixture(), vi.fn());
    expect(canvas.root.querySelector("canvas")).not.toBeNull();
    expect(canvas.renderer()).toBe("canvas");
    canvas.dispose();
    expect(readRendererSetting(undefined)).toBe("canvas");
    expect(readRendererSetting(appWith({ renderer: "nope" }).settings)).toBe("canvas");
    expect(readAbyssSettings(appWith({ renderer: "dom", fontSize: 15 }).settings, document.body)).toMatchObject({ renderer: "canvas", fontSize: 15, fontFamily: "Menlo, monospace" });
  });
});
