import type { AbyssSettings } from "../abyss/host";

export interface SettingsReader { get(key: string): unknown }

export type RendererSetting = "dom" | "canvas" | "webgl";
export const RENDERER_SETTINGS: readonly RendererSetting[] = ["dom", "canvas", "webgl"];
export const DEFAULT_RENDERER: RendererSetting = "webgl";
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
    renderer: readRendererSetting(settings) === "canvas" ? "canvas" : "webgl",
  };
}
