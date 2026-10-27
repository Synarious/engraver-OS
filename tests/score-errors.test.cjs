const fs = require("node:fs"),
  ts = require("typescript"),
  assert = require("node:assert/strict"),
  { test } = require("node:test");
for (const extension of [".ts", ".tsx"])
  require.extensions[extension] = (m, f) =>
    m._compile(
      ts.transpileModule(fs.readFileSync(f, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2020,
        },
      }).outputText,
      f,
    );
const React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server");
const storeModule = require("../src/store/editorStore.ts");
const { useEditorStore } = storeModule;
const { ScoreCanvas } = require("../src/components/workbench/ScoreCanvas.tsx");
test("render errors replace blank paper with a visible recovery message", () => {
  const original = storeModule.useEditorStore;
  try {
    storeModule.useEditorStore = () => ({
      ...original.getState(),
      scoreStatus: "error",
      scoreError: "Regression render failure",
    });
    const html = renderToStaticMarkup(React.createElement(ScoreCanvas));
    assert.ok(
      html.indexOf('role="alert"') < html.indexOf('class="score-paper"'),
    );
    assert.match(html, /Regression render failure/);
    assert.match(html, /Retry rendering/);
    assert.match(html, /height:0;min-height:0;overflow:hidden/);
  } finally {
    storeModule.useEditorStore = original;
  }
});
