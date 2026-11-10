const fs = require("node:fs"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
const { test } = require("node:test");
require.extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    f,
  );
const { PdfSession } = require("../src/utils/pdfSession.ts");
const {
  pageTapDirection,
  pdfCanvasScale,
} = require("../src/utils/pdfReader.ts");
test("PDF session destroys the loading task, never the resolved proxy", async () => {
  let destroyed = 0;
  const proxy = { numPages: 2 },
    session = new PdfSession();
  assert.equal(
    await session.load(() => ({
      promise: Promise.resolve(proxy),
      destroy: async () => {
        destroyed++;
      },
    })),
    proxy,
  );
  await session.dispose();
  await session.dispose();
  assert.equal(destroyed, 1);
});
test("PDF session closes safely while its document is still loading", async () => {
  let finish,
    destroyed = 0;
  const promise = new Promise((resolve) => {
      finish = resolve;
    }),
    session = new PdfSession();
  const loading = session.load(() => ({
    promise,
    destroy: async () => {
      destroyed++;
      finish({ numPages: 2 });
    },
  }));
  await session.dispose();
  assert.equal(await loading, null);
  assert.equal(destroyed, 1);
});
test("unmount before PDF.js import resolves does not start a new loading task", async () => {
  const session = new PdfSession();
  await session.dispose();
  let started = false;
  assert.equal(
    await session.load(() => {
      started = true;
      throw Error("must not load");
    }),
    null,
  );
  assert.equal(started, false);
});

test("PDF rasterization follows display width, zoom, and pixel density within canvas limits", () => {
  const width = 612,
    height = 792;
  for (const [displayWidth, pixelRatio] of [
    [360, 1],
    [360, 3],
    [720, 3],
  ]) {
    const scale = pdfCanvasScale(width, height, displayWidth, pixelRatio);
    assert.equal(Math.round(width * scale), displayWidth * pixelRatio);
  }
  const oversized = pdfCanvasScale(width, height, 2800, 3);
  assert.ok(height * oversized <= 4096);
  assert.ok(width * height * oversized ** 2 <= 8_000_000);
  const narrow = pdfCanvasScale(100, 5000, 300, 3);
  assert.ok(5000 * narrow <= 4096);
});

test("page turns distinguish edge taps from panning and respect the selected zones", () => {
  const rect = { left: 20, width: 400 },
    right = { x: 400, y: 180 },
    left = { x: 35, y: 180 },
    middleLeft = { x: 190, y: 180 };
  assert.equal(pageTapDirection(right, { x: 403, y: 185 }, rect), 1);
  assert.equal(pageTapDirection(left, left, rect), -1);
  assert.equal(pageTapDirection(right, { x: 402, y: 210 }, rect), 0);
  assert.equal(pageTapDirection(middleLeft, middleLeft, rect), 0);
  assert.equal(pageTapDirection(middleLeft, middleLeft, rect, "halves"), -1);
  assert.equal(pageTapDirection(right, right, rect, "off"), 0);
});
