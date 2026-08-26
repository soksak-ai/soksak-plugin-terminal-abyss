export interface FontSpec { fontFamily: string; fontSize: number; lineHeight: number }
export interface FontMetrics extends FontSpec { width: number; height: number; baseline: number; dpr: number }

export function fontCss(spec: FontSpec, bold: boolean, italic: boolean): string {
  return `${italic ? "italic " : ""}${bold ? "bold " : ""}${spec.fontSize}px ${spec.fontFamily}`;
}

export function measureFont(
  spec: FontSpec,
  dpr: number,
  createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): FontMetrics {
  const context = createCanvas().getContext("2d");
  if (!context) throw new Error("font measurement needs a 2d context");
  context.font = fontCss(spec, false, false);
  const measured = context.measureText("M");
  const ascent = measured.fontBoundingBoxAscent ?? measured.actualBoundingBoxAscent ?? spec.fontSize * 0.8;
  const descent = measured.fontBoundingBoxDescent ?? measured.actualBoundingBoxDescent ?? spec.fontSize * 0.2;
  const scale = Math.max(1, dpr);
  const snap = (value: number) => Math.round(value * scale) / scale;
  const glyphHeight = ascent + descent + 2;
  const width = snap(measured.width);
  const height = snap(Math.ceil(glyphHeight * spec.lineHeight));
  const baseline = snap(ascent + 1 + (height - glyphHeight) / 2);
  return { ...spec, width, height, baseline, dpr: scale };
}
