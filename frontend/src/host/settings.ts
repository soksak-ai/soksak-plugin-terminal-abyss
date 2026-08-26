import type { AbyssSettings } from "../abyss/host";

export interface SettingsReader { get(key: string): unknown }

export type RendererSetting = "dom" | "canvas" | "webgl";
export const RENDERER_SETTINGS: readonly RendererSetting[] = ["dom", "canvas", "webgl"];
// Measured: a WebGL pane costs 20.2 MB against a Canvas 2D pane's 9.2 MB, because each pane holds a
// context of its own, and with six panes open Canvas 2D applied 10 MiB in 1337 ms against WebGL's
// 4577 ms. WebGL is faster with one pane on an idle machine, which is why it stays a setting.
export const DEFAULT_RENDERER: RendererSetting = "canvas";
export const DEFAULT_FONT_FAMILY = "Menlo, monospace";

export function readRendererSetting(settings: SettingsReader | undefined): RendererSetting {
  const value = settings?.get("renderer");
  return typeof value === "string" && (RENDERER_SETTINGS as readonly string[]).includes(value) ? value as RendererSetting : DEFAULT_RENDERER;
}

// Painter settings for the two abyss renderers; "dom" never reaches here.
export function readAbyssSettings(settings: SettingsReader | undefined, root: HTMLElement): AbyssSettings {
  const mono = getComputedStyle(root.ownerDocument.documentElement).getPropertyValue("--mono").trim();
  const fontSize = settings?.get("fontSize");
  return {
    fontFamily: mono || DEFAULT_FONT_FAMILY,
    fontSize: typeof fontSize === "number" && Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 13,
    lineHeight: 1.2,
    cursorStyle: "block",
    cursorBlink: true,
    optionAsMeta: true,
    scrollLines: 3,
    // The abyss pane paints on one of two surfaces. Anything that is not WebGL is Canvas 2D — the
    // DOM setting never reaches this pane at all.
    renderer: readRendererSetting(settings) === "webgl" ? "webgl" : "canvas",
  };
}
