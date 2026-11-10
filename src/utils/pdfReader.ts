const maxCanvasSide = 4096;
const maxCanvasPixels = 8_000_000;

/** Match the CSS width at device resolution while bounding canvas memory. */
export function pdfCanvasScale(
  pageWidth: number,
  pageHeight: number,
  displayWidth: number,
  devicePixelRatio: number,
) {
  return Math.min(
    (displayWidth * devicePixelRatio) / pageWidth,
    maxCanvasSide / Math.max(pageWidth, pageHeight),
    Math.sqrt(maxCanvasPixels / (pageWidth * pageHeight)),
  );
}

export function pageTapDirection(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rect: { left: number; width: number },
  zones: "edges" | "halves" | "off" = "edges",
): -1 | 0 | 1 {
  if (zones === "off" || Math.hypot(end.x - start.x, end.y - start.y) > 10)
    return 0;
  const position = (start.x - rect.left) / rect.width;
  const boundary = zones === "halves" ? 0.5 : 0.2;
  if (position >= 0 && position < boundary) return -1;
  if (position > 1 - boundary && position <= 1) return 1;
  return 0;
}
