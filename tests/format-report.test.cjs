const fs = require("node:fs"),
  ts = require("typescript"),
  assert = require("node:assert/strict"),
  { test } = require("node:test");
require.extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    f,
  );
const { formatReport, fileFormat } = require("../src/utils/formatReport.ts"),
  { blankScore } = require("../src/utils/project.ts");
test("all supported imports and exports have a readable format review", () => {
  for (const format of [
    "musicxml",
    "mxl",
    "gp",
    "midi",
    "json",
    "pdf",
    "image",
    "original",
    "backup",
  ])
    for (const operation of ["import", "export"]) {
      const r = formatReport(format, operation);
      assert.ok(r.summary.length > 20);
      assert.ok(r.limitations.length);
      assert.ok(r.recommendation.length);
    }
  assert.equal(fileFormat("SCORE.MXL"), "musicxml");
  assert.equal(fileFormat("song.gp5"), "gp");
  assert.equal(fileFormat("song.mid"), "midi");
});
test("export review distinguishes original, project, backup and notation losses", () => {
  assert.match(
    formatReport("original", "export").limitations.join(" "),
    /Edits.*not included/,
  );
  assert.match(
    formatReport("json", "export").limitations.join(" "),
    /backing audio/,
  );
  assert.match(
    formatReport("backup", "export").preserves.join(" "),
    /backing audio/,
  );
  assert.match(
    formatReport("midi", "import").limitations.join(" "),
    /sixteenths/,
  );
  const s = blankScore();
  s.interchange = { warnings: ["Microtonal playback uses semitones."] };
  s.tracks[0].measures[0].voices[0].beats[0].notes = [
    {
      id: crypto.randomUUID(),
      pitch: 60,
      isTied: false,
      source: {
        bendpoints: [
          { offset: 0, value: 0 },
          { offset: 20, value: 2 },
          { offset: 60, value: 4 },
        ],
      },
    },
  ];
  const r = formatReport("musicxml", "export", s);
  assert.ok(r.limitations.some((t) => t.includes("bend curves")));
  assert.ok(r.limitations.includes(s.interchange.warnings[0]));
});
