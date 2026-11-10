const fs = require("node:fs");
const ts = require("typescript");
const assert = require("node:assert/strict");
const { test } = require("node:test");
require.extensions[".ts"] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
const {
  chordVoicings,
  guitarTuning,
  isScaleDiagram,
  pitchClass,
  resizeTuning,
} = require("../src/utils/harmonyLibrary.ts");
const { blankScore } = require("../src/utils/project.ts");
const { validateScore } = require("../src/storage/fileSystem.ts");

test("three to ten strings produce complete voicings within the chosen fret range", () => {
  for (let count = 3; count <= 10; count++) {
    const tuning = resizeTuning(guitarTuning, count);
    const shapes = chordVoicings(tuning, 0, [0, 4, 7], 19, 24);
    assert(shapes.length > 0);
    for (const shape of shapes) {
      assert.equal(shape.strings.length, count);
      const used = shape.strings.flatMap((fret, i) => {
        if (fret < 0) return [];
        assert(fret >= 19 && fret <= 24);
        return [pitchClass(tuning[i] + fret)];
      });
      assert.deepEqual(
        [...new Set(used)].sort((a, b) => a - b),
        [0, 4, 7],
      );
    }
  }
  assert.deepEqual(
    chordVoicings([67, 64, 60], 0, [0, 4, 7], 0, 0)[0].strings,
    [0, 0, 0],
  );
  assert.equal(chordVoicings([67, 64, 60], 0, [0, 4, 7, 10]).length, 0);
});

test("project data accepts a saved 24-fret scale and rejects malformed diagrams and fingerings", () => {
  const score = blankScore();
  const beat = score.tracks[0].measures[0].voices[0].beats[0];
  beat.scaleDiagram = {
    root: 0,
    scale: "Dorian",
    tuning: resizeTuning(guitarTuning, 10),
    firstFret: 0,
    lastFret: 24,
  };
  assert(isScaleDiagram(beat.scaleDiagram));
  assert.doesNotThrow(() => validateScore(JSON.parse(JSON.stringify(score))));
  beat.scaleDiagram.lastFret = 25;
  assert.throws(() => validateScore(score), /Invalid scale diagram/);
  beat.scaleDiagram.lastFret = 24;
  beat.notes.push({
    id: crypto.randomUUID(),
    pitch: 60,
    isTied: false,
    pianoFingering: { hand: "right", finger: 6 },
  });
  assert.throws(() => validateScore(score), /Invalid piano fingering/);
});
