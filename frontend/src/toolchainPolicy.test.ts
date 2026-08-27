import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("build toolchain policy", () => {
  it("fails direct pnpm entrypoints closed without an implicit install", () => {
    const root = join(__dirname, "../..");
    const pkg = JSON.parse(readFileSync(join(root, "frontend/package.json"), "utf8"));
    const selected = readFileSync(join(root, ".node-version"), "utf8").trim();
    expect(pkg.devEngines).toEqual({
      runtime: { name: "node", version: selected, onFail: "error" },
    });
    const workspace = readFileSync(join(root, "frontend/pnpm-workspace.yaml"), "utf8");
    expect(workspace).toMatch(/^engineStrict: true$/m);
    expect(workspace).toMatch(/^pmOnFail: error$/m);
    expect(workspace).toMatch(/^verifyDepsBeforeRun: error$/m);
  });
});
