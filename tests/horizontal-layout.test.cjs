const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const fixHorizontalBounds = require("../scripts/alphatab-horizontal-bounds.cjs");

test("horizontal SVG chunks share one set of score bounds", async () => {
  const core = path.join(
    path.dirname(require.resolve("@coderline/alphatab")),
    "alphaTab.core.mjs",
  );
  const source = fixHorizontalBounds(fs.readFileSync(core, "utf8"));
  const a = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  const settings = new a.Settings();
  settings.display.layoutMode = a.LayoutMode.Horizontal;
  settings.display.barCountPerPartial = 2;
  settings.core.includeNoteBounds = true;
  const importer = new a.importer.AlphaTexImporter();
  importer.initFromString(
    "\\title 'Horizontal' . " +
      Array.from({ length: 12 }, () => "3.3.4 4.3 5.3 6.3").join(" | "),
    settings,
  );
  const score = importer.readScore();
  const renderer = new a.rendering.ScoreRenderer(settings);
  renderer.width = 800;
  const chunks = [];
  const painted = [];
  renderer.partialLayoutFinished.on((result) => {
    if (result.firstMasterBarIndex >= 0) chunks.push(result);
  });
  renderer.partialRenderFinished.on((result) => painted.push(result.id));
  renderer.renderScore(score, [0]);

  assert.equal(chunks.length, 6);
  assert.equal(renderer.boundsLookup.staffSystems.length, 1);
  const lastBeat = score.tracks[0].staves[0].bars.at(-1).voices[0].beats.at(-1);
  assert.ok(renderer.boundsLookup.findBeat(lastBeat).notes.length);
  assert.deepEqual(painted, []);
  renderer.renderResult(chunks.at(-1).id);
  assert.deepEqual(painted, [chunks.at(-1).id]);
});
