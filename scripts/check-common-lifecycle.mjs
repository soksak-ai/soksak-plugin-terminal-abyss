import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const hostDirectory = new URL("../frontend/src/host/", import.meta.url);
const activate = readFileSync(new URL("activate.ts", hostDirectory), "utf8");

test("the common kit exclusively owns terminal lifecycle and standard commands", () => {
  assert.equal((activate.match(/activateProviderTerminalPlugin\s*\(/g) ?? []).length, 1);
  for (const name of readdirSync(hostDirectory)) {
    if (!name.endsWith(".ts") || name.includes(".test.")) continue;
    const body = readFileSync(join(hostDirectory.pathname, name), "utf8");
    // The kit's own frame presenter is absent from this list on purpose: the "dom" renderer hands a
    // pane to it, which is consuming a presenter rather than owning a lifecycle.
    for (const forbidden of [
      "createTerminalSessionBinding", "createTerminalStatusController", "createTerminalResizeWorker",
      "observeTerminalLayout", "waitForTerminalConditions", "recoveryRequest",
    ]) assert.equal(body.includes(forbidden), false, `host/${name} owns ${forbidden}`);
  }
  assert.match(activate, /presenter: createAbyssPresenter\(app\)/, "the kit receives the presenter factory");
});
