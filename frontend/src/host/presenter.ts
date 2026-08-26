import { createProviderFramePresenter, type ProviderFramePresenter } from "@soksak/soksak-kit-plugin-terminal";
import type { AbyssHost, AbyssPresentation } from "../abyss/host";
import { createAtlasPool } from "../abyss/painter";
import { createPanePresenter, type PanePresenter } from "../abyss/pane-presenter";
import { readAbyssSettings, readRendererSetting, type RendererSetting, type SettingsReader } from "./settings";
import { bindAbyssThemeSurface, observeAbyssTheme, readAbyssTheme } from "./theme";

export interface AbyssApp {
  settings?: SettingsReader;
  clipboard?: { writeText?: (text: string) => Promise<void> };
  // Only the executor is read here. The host's registry is wider; this states no shape for it, so
  // one interface can extend both this and the kit's host.
  commands?: { execute?(name: string, params?: Record<string, unknown>): Promise<unknown> } & Record<string, unknown>;
}

export interface PresenterContext {
  nodeSuffix?: string | null;
  presentation?: () => AbyssPresentation;
  onPresentationChange?: (listener: (presentation: AbyssPresentation) => void) => () => void;
}

// The kit presenter, widened with the frame entry points the kit calls on any presenter.
export interface DomPresenter extends ProviderFramePresenter {
  applyFrame(frame: unknown): boolean;
  renderFrame(frame: unknown): void;
  renderer(): RendererSetting;
}
export type ViewPresenter = PanePresenter | DomPresenter;
export type AbyssPresenterFactory = (root: HTMLElement, send: (text: string) => void, context?: PresenterContext) => ViewPresenter;

type KitPresenterFactory = (root: HTMLElement, send: (text: string) => void, options?: { nodeSuffix?: string | null }) => ProviderFramePresenter;

export function createAbyssHost(app: AbyssApp, root: HTMLElement, context: PresenterContext = {}): AbyssHost {
  const document = root.ownerDocument;
  const view = document.defaultView;
  bindAbyssThemeSurface(root);
  return {
    theme: () => readAbyssTheme(root),
    onThemeChange: (callback) => observeAbyssTheme(root, callback),
    presentation: () => ({ visible: (context.presentation?.().visible ?? true) && document.visibilityState !== "hidden" }),
    onPresentationChange(callback) {
      const stopContext = context.onPresentationChange?.((presentation) => callback({ visible: presentation.visible && document.visibilityState !== "hidden" }));
      const onVisibility = () => callback({ visible: (context.presentation?.().visible ?? true) && document.visibilityState !== "hidden" });
      document.addEventListener("visibilitychange", onVisibility);
      return () => { stopContext?.(); document.removeEventListener("visibilitychange", onVisibility); };
    },
    clipboard: {
      writeText: async (text) => {
        if (app.clipboard?.writeText) { await app.clipboard.writeText(text); return; }
        await view?.navigator.clipboard?.writeText(text);
      },
    },
    openUrl(url) {
      if (app.commands?.execute) { void app.commands.execute("browser.open", { url }).catch(() => view?.open(url, "_blank", "noopener")); return; }
      view?.open(url, "_blank", "noopener");
    },
    settings: readAbyssSettings(app.settings, root),
    devicePixelRatio: () => view?.devicePixelRatio ?? 1,
    now: () => (view?.performance ?? performance).now(),
  };
}

export function createDomPresenter(root: HTMLElement, send: (text: string) => void, context: PresenterContext = {}): DomPresenter {
  const presenter = (createProviderFramePresenter as unknown as KitPresenterFactory)(root, send, { nodeSuffix: context.nodeSuffix ?? null });
  root.dataset.renderer = "dom";
  const render = (frame: unknown) => presenter.render(frame as Parameters<ProviderFramePresenter["render"]>[0]);
  return {
    ...presenter,
    applyFrame(frame) { render(frame); return true; },
    renderFrame: render,
    renderer: () => "dom",
  };
}

// The renderer is read once per pane at creation; an open pane keeps it.
export function createAbyssPresenter(app: AbyssApp): AbyssPresenterFactory {
  // One atlas per font and scale, for every pane this plugin paints: the glyphs are the same pixels,
  // and a second atlas is a second canvas and a second texture holding them again.
  const atlases = createAtlasPool(() => document.createElement("canvas"));
  return (root, send, context = {}) => {
    if (readRendererSetting(app.settings) === "dom") return createDomPresenter(root, send, context);
    return createPanePresenter({
      root, send, host: createAbyssHost(app, root, context), nodeSuffix: context.nodeSuffix ?? null,
      atlases,
    });
  };
}
