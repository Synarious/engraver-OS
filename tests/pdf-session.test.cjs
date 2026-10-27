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
