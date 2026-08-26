import { MODE_KEYS, type AbyssFrame, type AbyssLine, type AbyssModes, type AbyssRun } from "./host";

export const FRAME_KEYS = ["outputSequence", "cols", "rows", "cursor", "cursorVisible", "altActive", "historySize", "offset", "modes", "full", "lines"] as const;
export const LINE_KEYS = ["y", "wrapped", "runs"] as const;
export const RUN_KEYS = ["text", "fg", "bg", "attrs", "n"] as const;

function fail(path: string, expected: string): never {
  throw new Error(`frame shape mismatch at ${path}: expected ${expected}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail(path, "object");
}
function integer(value: unknown, path: string, min = 0): number {
  return Number.isInteger(value) && (value as number) >= min ? value as number : fail(path, `integer >= ${min}`);
}
function bool(value: unknown, path: string): boolean {
  return typeof value === "boolean" ? value : fail(path, "boolean");
}
function text(value: unknown, path: string): string {
  return typeof value === "string" ? value : fail(path, "string");
}
function requireKeys(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of keys) if (!(key in value)) fail(`${path}.${key}`, "present");
}

function decodeRun(value: unknown, path: string): AbyssRun {
  const run = record(value, path);
  requireKeys(run, RUN_KEYS, path);
  const decoded = {
    text: text(run.text, `${path}.text`), fg: text(run.fg, `${path}.fg`), bg: text(run.bg, `${path}.bg`),
    attrs: integer(run.attrs, `${path}.attrs`), n: integer(run.n, `${path}.n`, 1),
    wide: run.wide === undefined ? false : bool(run.wide, `${path}.wide`),
    link: run.link === undefined || run.link === null ? null : text(run.link, `${path}.link`),
  };
  if (run.wide === decoded.wide && run.link === decoded.link) return run as unknown as AbyssRun;
  return decoded;
}

function decodeLine(value: unknown, path: string): AbyssLine {
  const line = record(value, path);
  requireKeys(line, LINE_KEYS, path);
  const rawRuns = Array.isArray(line.runs) ? line.runs : fail(`${path}.runs`, "array");
  let normalized: AbyssRun[] | null = null;
  for (let index = 0; index < rawRuns.length; index += 1) {
    const decoded = decodeRun(rawRuns[index], `${path}.runs[${index}]`);
    if (decoded === rawRuns[index]) continue;
    normalized ??= rawRuns.slice() as AbyssRun[];
    normalized[index] = decoded;
  }
  const y = integer(line.y, `${path}.y`);
  const wrapped = bool(line.wrapped, `${path}.wrapped`);
  if (normalized === null && line.y === y && line.wrapped === wrapped) return line as unknown as AbyssLine;
  return { y, wrapped, runs: normalized ?? rawRuns as AbyssRun[] };
}

export function decodeFrame(value: unknown): AbyssFrame {
  const frame = record(value, "frame");
  requireKeys(frame, FRAME_KEYS, "frame");
  const cursor = Array.isArray(frame.cursor) && frame.cursor.length === 2 ? frame.cursor : fail("frame.cursor", "[row, col]");
  const modes = record(frame.modes, "frame.modes");
  requireKeys(modes, MODE_KEYS, "frame.modes");
  for (const key of MODE_KEYS) bool(modes[key], `frame.modes.${key}`);
  const rawLines = Array.isArray(frame.lines) ? frame.lines : fail("frame.lines", "array");
  let normalized: AbyssLine[] | null = null;
  for (let index = 0; index < rawLines.length; index += 1) {
    const decoded = decodeLine(rawLines[index], `frame.lines[${index}]`);
    if (decoded === rawLines[index]) continue;
    normalized ??= rawLines.slice() as AbyssLine[];
    normalized[index] = decoded;
  }
  const lines = normalized ?? rawLines as AbyssLine[];
  return {
    outputSequence: integer(frame.outputSequence, "frame.outputSequence"),
    cols: integer(frame.cols, "frame.cols", 1), rows: integer(frame.rows, "frame.rows", 1),
    cursor: [integer(cursor[0], "frame.cursor[0]"), integer(cursor[1], "frame.cursor[1]")],
    cursorVisible: bool(frame.cursorVisible, "frame.cursorVisible"), altActive: bool(frame.altActive, "frame.altActive"),
    historySize: integer(frame.historySize, "frame.historySize"), offset:
integer(frame.offset, "frame.offset"),
    modes: modes as unknown as AbyssModes, full: bool(frame.full, "frame.full"), lines,
  };
}
