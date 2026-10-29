const fs = require("node:fs"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
const { test } = require("node:test");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    filename,
  );
const { blankScore } = require("../src/utils/project.ts");
const {
  parseGuitarPro,
  toNativeScore,
} = require("../src/utils/alphaTabParser.ts");
const { exportMusicXML } = require("../src/utils/musicxml.ts");
const { distributeLyrics } = require("../src/utils/lyrics.ts");
const { applySelectionPatch } = require("../src/utils/scoreSelection.ts");
const {
  applyNotationCommand,
  notationCommands,
} = require("../src/utils/notationCommands.ts");
const { zipSync, strToU8 } = require("fflate");
const load = (bytes) =>
  parseGuitarPro(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
const fixture = () => {
  const score = blankScore("Lyrics & expression", "piano");
  score.tracks[0].measures.forEach((m) =>
    m.voices[0].beats.forEach(
      (b) =>
        (b.notes = [{ id: crypto.randomUUID(), pitch: 60, isTied: false }]),
    ),
  );
  return score;
};
test("lyric semantics, named verses, offsets, stems and expression survive XML and MXL", () => {
  const score = fixture(),
    b = score.tracks[0].measures[0].voices[0].beats[0];
  score.engraving = {
    systemGap: 42,
    staffGap: 23,
    barsPerRow: 2,
    lyricFontSize: 16,
    titleFontSize: 40,
  };
  b.lyrics = ["Hel<&", "World"];
  b.lyricDetails = [
    {
      number: "verse-A",
      syllabic: "begin",
      extend: "start",
      placement: "above",
      offsetX: -4,
      offsetY: 15,
    },
    { number: "3", syllabic: "single" },
  ];
  b.stemDirection = "down";
  b.dynamics = "p";
  b.notes[0].velocity = 110;
  b.notes[0].velocityOverride = true;
  b.notes[0].articulations = { marcato: true, staccato: true };
  const xml = exportMusicXML(score);
  assert.match(xml, /strong-accent/);
  assert.match(xml, /new-system="yes"/);
  const zipped = zipSync({
    "META-INF/container.xml": strToU8(
      '<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>',
    ),
    "score.musicxml": strToU8(xml),
  });
  for (const bytes of [strToU8(xml), zipped]) {
    const imported = load(bytes),
      beat = imported.tracks[0].measures[0].voices[0].beats[0];
    assert.deepEqual(beat.lyrics, b.lyrics);
    assert.deepEqual(
      JSON.parse(JSON.stringify(beat.lyricDetails)),
      b.lyricDetails,
    );
    assert.equal(beat.stemDirection, "down");
    assert.equal(beat.notes[0].velocity, 110);
    assert.equal(beat.notes[0].articulations.marcato, true);
    assert.equal(imported.engraving.systemGap, 42);
    assert.equal(imported.engraving.staffGap, 23);
    assert.equal(imported.engraving.lyricFontSize, 16);
    assert.equal(imported.engraving.titleFontSize, 40);
    assert.deepEqual(imported.source.systemslayout, [2, 2]);
    const native =
      toNativeScore(imported).tracks[0].staves[0].bars[0].voices[0].beats[0];
    assert.equal(native.preferredBeamDirection, 1);
    assert.equal(native.notes[0].accentuated, 2);
    assert.equal(native.notes[0].dynamics, 6);
  }
});
test("lyric distribution skips rests, preserves other verses, and fails before overwriting", () => {
  const score = fixture(),
    beats = score.tracks[0].measures[0].voices[0].beats;
  beats[1].notes = [];
  beats[0].lyrics = ["existing"];
  distributeLyrics(beats, 1, "Hel-lo _");
  assert.deepEqual(beats[0].lyrics, ["existing", "Hel"]);
  assert.equal(beats[2].lyricDetails[1].syllabic, "end");
  assert.equal(beats[2].lyricDetails[1].extend, "start");
  assert.equal(beats[3].lyricDetails[1].extend, "stop");
  const snapshot = JSON.stringify(beats);
  assert.throws(
    () => distributeLyrics(beats, 0, "one two three four"),
    /available/,
  );
  assert.equal(JSON.stringify(beats), snapshot);
});
test("attack override, printed dynamics, and articulation palette remain consistent", () => {
  const score = fixture(),
    b = score.tracks[0].measures[0].voices[0].beats[0],
    n = b.notes[0];
  applySelectionPatch(score, [n.id], [b.id], {
    dynamics: "p",
    velocity: 120,
    marcato: true,
  });
  assert.equal(
    toNativeScore(score).tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0]
      .dynamics,
    7,
  );
  applyNotationCommand(score, [n.id], [b.id], "tenuto");
  assert.equal(n.articulations.marcato, false);
  assert.equal(n.articulations.tenuto, true);
  assert.equal(
    toNativeScore(score).tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0]
      .accentuated,
    3,
  );
  applySelectionPatch(score, [n.id], [b.id], { velocity: null });
  assert.equal(
    toNativeScore(score).tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0]
      .dynamics,
    2,
  );
  assert.throws(
    () => applySelectionPatch(score, [n.id], [b.id], { velocity: 128 }),
    /127/,
  );
});
