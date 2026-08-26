import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const abyss = new URL("../frontend/src/abyss/", import.meta.url).pathname;

function files(directory) {
  const out = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (name.endsWith(".ts")) out.push(path);
  }
  return out;
}

test("frontend/src/abyss depends only on itself", () => {
  const offenders = [];
  let scanned = 0;
  for (const file of files(abyss)) {
    scanned += 1;
    const body = readFileSync(file, "utf8");
    for (const match of body.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
      const specifier = match[1];
      const name = relative(abyss, file);
      const isTest = name.includes(".test.");
      // A test names its runner; the modules under test name nothing outside this directory.
      if (isTest && (specifier === "vitest" || specifier === "../testEnvironment")) continue;
      if (specifier.startsWith("@soksak/")) offenders.push(`${name}: ${specifier}`);
      else if (/^\.\.\//.test(specifier)) offenders.push(`${name}: ${specifier}`);
      else if (!specifier.startsWith(".")) offenders.push(`${name}: ${specifier}`);
    }
  }
  assert.ok(scanned >= 16, `scanned ${scanned} files`);
  assert.deepEqual(offenders, []);
});
