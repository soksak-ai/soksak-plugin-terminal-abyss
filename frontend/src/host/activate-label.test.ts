import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ config: null as Record<string, unknown> | null }));

vi.mock("@soksak/soksak-kit-plugin-terminal", async (original) => ({
  ...await original<typeof import("@soksak/soksak-kit-plugin-terminal")>(),
  activateProviderTerminalPlugin: (_host: unknown, _subscriptions: unknown, config: Record<string, unknown>) => { captured.config = config; },
}));

import { activate, type TerminalHost } from "./activate";
import { manifest } from "../manifest";

describe("Abyss status label", () => {
  beforeEach(() => { captured.config = null; });
  it("uses the name declared by plugin.json", () => {
    activate({ app: {} as TerminalHost, subscriptions: [] });
    expect(captured.config?.label).toEqual(manifest.name);
  });
});
