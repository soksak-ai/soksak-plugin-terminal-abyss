// Test doubles for the canvas surfaces: a recording 2D context and a recording WebGL2 context.
export interface RecordedCall { name: string; args: unknown[] }

const recordings = new WeakMap<object, RecordedCall[]>();
const contexts = new WeakMap<HTMLCanvasElement, Record<string, object>>();

export function callsOf(context: object): RecordedCall[] {
  return recordings.get(context) ?? [];
}

export function callsNamed(context: object, name: string): RecordedCall[] {
  return callsOf(context).filter((call) => call.name === name);
}

function create2d(canvas: HTMLCanvasElement): object {
  const calls: RecordedCall[] = [];
  const context: Record<string, unknown> = {
    canvas, font: "", fillStyle: "", strokeStyle: "", globalAlpha: 1, lineWidth: 1,
    textBaseline: "alphabetic", imageSmoothingEnabled: true,
  };
  for (const name of [
    "fillRect", "clearRect", "fillText", "strokeRect", "strokeText", "setTransform", "scale", "translate",
    "save", "restore", "beginPath", "rect", "clip", "drawImage", "putImageData", "resetTransform",
  ]) context[name] = (...args: unknown[]) => { calls.push({ name, args }); };
  context.measureText = (text: string) => ({
    width: 7 * Array.from(text).length,
    fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3,
    actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3,
  });
  context.getImageData = (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  recordings.set(context, calls);
  return context;
}

function constantOf(name: string): number {
  let hash = 7;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function createWebgl2(canvas: HTMLCanvasElement): object {
  const calls: RecordedCall[] = [];
  let handles = 0;
  const target: Record<string, unknown> = { canvas, drawingBufferWidth: 0, drawingBufferHeight: 0 };
  const results: Record<string, () => unknown> = {
    getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: () => handles++, getUniformLocation: () => ({ id: ++handles }),
    createShader: () => ({ id: ++handles }), createProgram: () => ({ id: ++handles }),
    createBuffer: () => ({ id: ++handles }), createTexture: () => ({ id: ++handles }),
    createVertexArray: () => ({ id: ++handles }), isContextLost: () => false,
    getShaderInfoLog: () => "", getProgramInfoLog: () => "", getExtension: () => null,
    getParameter: () => 0, getError: () => 0,
  };
  const proxy = new Proxy(target, {
    get(object, property) {
      if (typeof property !== "string") return undefined;
      if (property in object) return object[property];
      if (/^[A-Z][A-Z0-9_]*$/.test(property)) return constantOf(property);
      return (...args: unknown[]) => { calls.push({ name: property, args }); return results[property]?.(); };
    },
    set(object, property, value) { if (typeof property === "string") object[property] = value; return true; },
  });
  recordings.set(proxy, calls);
  return proxy;
}

if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, kind: string): unknown {
    let held = contexts.get(this);
    if (!held) { held = {}; contexts.set(this, held); }
    if (kind === "2d") return held["2d"] ??= create2d(this);
    if (kind === "webgl2") return held.webgl2 ??= createWebgl2(this);
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;
}
if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (typeof document !== "undefined") {
  for (const [name, value] of Object.entries({ fg: "#eeeeec", card: "#1e1e1e", acc: "#ffffff", fg3: "#555753" })) {
    document.documentElement.style.setProperty(`--${name}`, value);
  }
}
