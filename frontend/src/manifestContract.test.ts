import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TERMINAL_PLUGIN_CONTRACT, TERMINAL_PLUGIN_NODES, validateTerminalPluginManifestCommands } from "@soksak/soksak-contract-plugin-terminal";

describe("terminal plugin manifest contract", () => {
  it("declares every common terminal command, the split surface, and its runtime dependencies", () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, "../../plugin.json"), "utf8"));
    const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8"));
    expect(manifest.id).toBe("soksak-plugin-terminal-abyss");
    expect(manifest.name).toEqual({ en: "Abyss Terminal", ko: "Abyss 터미널" });
    expect(manifest.version).toBe("0.0.5");
    expect(pkg.dependencies["@soksak/soksak-kit-plugin-terminal"]).toBe("0.0.62");
    expect(manifest).not.toHaveProperty("spec");
    expect(manifest.appVersionRequirement).toBe("0.0.1");
    expect(manifest.implements).toEqual([TERMINAL_PLUGIN_CONTRACT]);
    expect(manifest.permissions).toContain("clipboard:write");
    expect(manifest.permissions).toContain("ui:statusbar");
    const engines = ["alacritty", "ghostty", "kitty", "shitty", "vt100", "wezterm"];
    expect(manifest.runtimeDependencies.sidecars.map((sidecar: { id: string }) => sidecar.id)).toEqual(["soksak-sidecar-pty", ...engines.map((engine) => `soksak-sidecar-terminal-${engine}`)]);
    expect(Object.fromEntries(manifest.runtimeDependencies.sidecars.map((sidecar: { id: string; version: string }) => [sidecar.id, sidecar.version]))).toEqual({
      "soksak-sidecar-pty": "0.0.12",
      "soksak-sidecar-terminal-alacritty": "0.0.18",
      "soksak-sidecar-terminal-ghostty": "0.0.18",
      "soksak-sidecar-terminal-kitty": "0.0.14",
      "soksak-sidecar-terminal-shitty": "0.0.13",
      "soksak-sidecar-terminal-vt100": "0.0.17",
      "soksak-sidecar-terminal-wezterm": "0.0.17",
    });
    for (const sidecar of manifest.runtimeDependencies.sidecars) expect(sidecar).toEqual({ id: expect.stringMatching(/^soksak-sidecar-[a-z0-9-]+$/), version: expect.stringMatching(/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/) });
    const setting = (key: string) => manifest.configuration.find((item: { key: string }) => item.key === key);
    expect(setting("engine")).toMatchObject({ type: "enum", enum: engines, default: "alacritty" });
    expect(setting("renderer")).toMatchObject({ type: "enum", enum: ["dom", "canvas", "webgl"], default: "canvas" });
    expect(setting("renderer").enumLabels).toHaveLength(3);
    expect(setting("fontSize")).toMatchObject({ type: "number", default: 13 });
    expect(validateTerminalPluginManifestCommands(manifest.contributes.commands)).toEqual([]);
    const names = manifest.contributes.commands.map((command: { name: string }) => command.name);
    for (const name of ["split", "pane.close", "pane.focus", "pane.resize", "pane.equalize", "pane.maximize", "pane.broadcast", "pane.title", "scroll", "selection", "input.compose", "exec", "cwd"]) expect(names).toContain(name);
    const nodes = manifest.contributes.nodes.map((node: { id: string }) => node.id);
    for (const node of TERMINAL_PLUGIN_NODES) expect(nodes).toContain(node);
    expect(nodes).toContain("pane");
    expect(nodes).toContain("gutter");
    expect(manifest.contributes.programs).toEqual([expect.objectContaining({ id: "terminal-abyss", kind: "view", view: "content" })]);
  });
});
