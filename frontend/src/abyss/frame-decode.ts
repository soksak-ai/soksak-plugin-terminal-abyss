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
  return {
    text: text(run.text, `${path}.text`), fg: text(run.fg, `${path}.fg`), bg: text(run.bg, `${path}.bg`),
    attrs: integer(run.attrs, `${path}.attrs`), n: integer(run.n, `${path}.n`, 1),
    wide: run.wide === undefined ? false : bool(run.wide, `${path}.wide`),
    link: run.link === undefined || run.link === null ? null : text(run.link, `${path}.link`),
  };
}

function decodeLine(value: unknown, path: string): AbyssLine {
  const line = record(value, path);
  requireKeys(line, LINE_KEYS, path);
  const runs = Array.isArray(line.runs) ? line.runs.map((run, index) => decodeRun(run, `${path}.runs[${index}]`)) : fail(`${path}.runs`, "array");
  return { y: integer(line.y, `${path}.y`), wrapped: bool(line.wrapped, `${path}.wrapped`), runs };
}

export function decodeFrame(value: unknown): AbyssFrame {
  const frame = record(value, "frame");
  requireKeys(frame, FRAME_KEYS, "frame");
  const cursor = Array.isArray(frame.cursor) && frame.cursor.length === 2 ? frame.cursor : fail("frame.cursor", "[row, col]");
  const modes = record(frame.modes, "frame.modes");
  requireKeys(modes, MODE_KEYS, "frame.modes");
  const decodedModes = {} as Record<keyof AbyssModes, boolean>;
  for (const key of MODE_KEYS) decodedModes[key] = bool(modes[key], `frame.modes.${key}`);
  const lines = Array.isArray(frame.lines) ? frame.lines.map((line, index) => decodeLine(line, `frame.lines[${index}]`)) : fail("frame.lines", "array");
  return {
    outputSequence: integer(frame.outputSequence, "frame.outputSequence"),
    cols: integer(frame.cols, "frame.cols", 1), rows: integer(frame.rows, "frame.rows", 1),
    cursor: [integer(cursor[0], "frame.cursor[0]"), integer(cursor[1], "frame.cursor[1]")],
    cursorVisible: bool(frame.cursorVisible, "frame.cursorVisible"), altActive: bool(frame.altActive, "frame.altActive"),
    historySize: integer(frame.historySize, "frame.historySize"), offset:
integer(frame.offset, "frame.offset"),
    modes: decodedModes as AbyssModes, full: bool(frame.full, "frame.full"), lines,
  };
}
