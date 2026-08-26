import { activateProviderTerminalPlugin, type ProviderTerminalPluginConfig, type ProviderTerminalPluginHost } from "@soksak/soksak-kit-plugin-terminal";

import { sentence } from "./i18n";
import { createAbyssPresenter, type AbyssApp } from "./presenter";

export const PLUGIN_ID = "soksak-plugin-terminal-abyss";
export const ENGINES = ["alacritty", "ghostty", "kitty", "shitty", "vt100", "wezterm"] as const;

export interface TerminalHost extends ProviderTerminalPluginHost {
  locale(): string;
  // Read by the presenter through AbyssApp, which this satisfies structurally.
  clipboard?: AbyssApp["clipboard"];
  terminal?: ProviderTerminalPluginHost["terminal"] & { getCwd?(pane: string): string | undefined };
}

export interface ActivateContext {
  app: TerminalHost;
  subscriptions: { dispose(): void }[];
}

export function activate(context: ActivateContext): void {
  const app = context.app;
  const viewParam = { type: "string", description: sentence("terminal.param.view") };
  const config = {
    pluginId: PLUGIN_ID,
    engineId: "alacritty",
    ptySidecarId: "soksak-sidecar-pty",
    terminalSidecarId: "soksak-sidecar-terminal-alacritty",
    engines: {
      setting: "engine",
      sidecars: Object.fromEntries(ENGINES.map((engine) => [engine, `soksak-sidecar-terminal-${engine}`])),
    },
    programId: "terminal-abyss",
    label: sentence("terminal.label"),
    rendererId: "abyss",
    presenter: createAbyssPresenter(app),
    extensions: [
      {
        name: "exec", danger: "inject" as const,
        params: { cmd: { type: "string", required: true, description: sentence("terminal.param.cmd") }, view: viewParam },
        handler(params: Record<string, unknown>, screen: { pane: string; writable: boolean; send(data: string): void } | undefined) {
          const cmd = typeof params.cmd === "string" ? params.cmd : "";
          if (!screen?.writable) return { sent: false };
          screen.send(`${cmd}\r`);
          return { view: screen.pane, sent: cmd.length + 1 };
        },
      },
      {
        name: "cwd", params: { view: viewParam },
        handler(_params: Record<string, unknown>, screen: { pane: string } | undefined) {
          return { view: screen?.pane ?? null, cwd: screen ? app.terminal?.getCwd?.(screen.pane) ?? null : null };
        },
      },
    ],
  };
  activateProviderTerminalPlugin(app, context.subscriptions, config as unknown as ProviderTerminalPluginConfig);
}
