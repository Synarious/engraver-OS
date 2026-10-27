const fs = require("node:fs");
const ts = require("typescript");
const assert = require("node:assert/strict");
const { test } = require("node:test");
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    filename,
  );
};
const a = require("@coderline/alphatab");
const { blankScore } = require("../src/utils/project.ts");
const {
  parseGuitarPro,
  toNativeScore,
} = require("../src/utils/alphaTabParser.ts");
const { exportMusicXML } = require("../src/utils/musicxml.ts");
const { parseMidi } = require("../src/utils/midi.ts");
test("blank score renders rests with the selected instrument", () => {
  for (const type of ["guitar", "bass", "piano", "percussion"]) {
    const score = blankScore("Test", type);
    const native = toNativeScore(score);
    assert.equal(native.tracks[0].staves[0].bars.length, 4);
    assert.equal(
      native.tracks[0].staves[0].bars[0].voices[0].beats[0].isRest,
      true,
    );
    assert.equal(
      native.tracks[0].staves[0].isPercussion,
      type === "percussion",
    );
  }
});
test("Guitar Pro round trip preserves string pitches, voices, staves, and bends", () => {
  const score = blankScore("Round trip");
  score.tracks[0].measures[0].voices[0].beats[0].notes = [
    {
      id: crypto.randomUUID(),
      pitch: 64,
      string: 0,
      fret: 0,
      isTied: false,
      source: {
        bendtype: 1,
        bendpoints: [
          { offset: 0, value: 0 },
          { offset: 60, value: 4 },
        ],
      },
    },
  ];
  score.tracks[0].measures[0].voices.push({
    index: 1,
    beats: [
      {
        id: crypto.randomUUID(),
        duration: "h",
        isDotted: false,
        isTuplet: true,
        tuplet: [3, 2],
        notes: [],
      },
    ],
  });
  score.tracks[0].additionalStaves = [
    { measures: blankScore("", "piano").tracks[0].measures },
  ];
  const native = toNativeScore(score);
  assert.equal(
    native.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0].realValue,
    64,
  );
  const bytes = new a.exporter.Gp7Exporter().export(native);
  const imported = parseGuitarPro(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  assert.equal(
    imported.tracks[0].measures[0].voices[0].beats[0].notes[0].string,
    0,
  );
  assert.equal(imported.tracks[0].measures[0].voices.length, 2);
  assert.equal(imported.tracks[0].additionalStaves.length, 1);
  assert.ok(
    imported.tracks[0].measures[0].voices[0].beats[0].notes[0].source.bendpoints
      .length,
  );
});
test("MusicXML reimports pitched notes, title, voices and staves", () => {
  const score = blankScore("A & B", "piano");
  score.tracks[0].measures[0].voices[0].beats[0].notes = [
    { id: crypto.randomUUID(), pitch: 60, isTied: false },
  ];
  score.tracks[0].additionalStaves = [
    { measures: blankScore("", "piano").tracks[0].measures },
  ];
  const text = exportMusicXML(score);
  assert.match(text, /A &amp; B/);
  const native = a.importer.ScoreLoader.loadScoreFromBytes(
    new TextEncoder().encode(text),
  );
  assert.equal(native.title.replace(/\u00a0/g, " "), "A & B");
  assert.equal(native.tracks[0].staves.length, 2);
  assert.equal(
    native.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0].realValue,
    60,
  );
});
test("MIDI import retains channel program and tied sustain", () => {
  const events = [
    0, 0xc0, 40, 0, 0x90, 60, 100, 0x83, 0x60, 0x80, 60, 0, 0, 255, 47, 0,
  ];
  const bytes = new Uint8Array([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    1,
    224,
    77,
    84,
    114,
    107,
    0,
    0,
    0,
    events.length,
    ...events,
  ]);
  const score = parseMidi(bytes.buffer, "example.mid");
  assert.equal(score.tracks[0].midiProgram, 40);
  assert.equal(
    score.tracks[0].measures[0].voices[0].beats[0].notes[0].pitch,
    60,
  );
  assert.equal(
    score.tracks[0].measures[0].voices[0].beats[1].notes[0].isTied,
    true,
  );
});
test("import preserves transposing instrument pitch and within-measure tempo changes", () => {
  const score = blankScore("Transposing", "piano");
  score.tracks[0].source = { staves: [{ transpositionpitch: 12 }] };
  score.tracks[0].measures[0].voices[0].beats[0].notes = [
    { id: crypto.randomUUID(), pitch: 60, isTied: false },
  ];
  score.tracks[0].measures[0].masterSource = {
    tempoautomations: [
      { type: 0, value: 120, ratioposition: 0 },
      { type: 0, value: 90, ratioposition: 0.5 },
    ],
  };
  const native = toNativeScore(score);
  const loader = a.importer.ScoreLoader.loadScoreFromBytes;
  let imported;
  try {
    a.importer.ScoreLoader.loadScoreFromBytes = () => native;
    imported = parseGuitarPro(new ArrayBuffer(0));
  } finally {
    a.importer.ScoreLoader.loadScoreFromBytes = loader;
  }
  const round = toNativeScore(imported);
  assert.equal(
    round.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0].realValue,
    native.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0].realValue,
  );
  assert.equal(round.masterBars[0].tempoAutomations.length, 2);
});
test("copying imported measures regenerates internal renderer IDs", () => {
  const score = blankScore();
  score.tracks[0].measures[0].voices[0].beats[0].source = { id: 55 };
  score.tracks[0].measures[1].voices[0].beats[0].source = { id: 55 };
  const native = toNativeScore(score);
  assert.notEqual(
    native.tracks[0].staves[0].bars[0].voices[0].beats[0].id,
    native.tracks[0].staves[0].bars[1].voices[0].beats[0].id,
  );
});
const { freshIds, collectNotes, setBeatDuration, voiceOptions } = {
  ...require("../src/utils/project.ts"),
  ...require("../src/utils/noteLinks.ts"),
};
const path = require("node:path");
const corpusRoot = path.join(__dirname, "../review-artifacts/song-import");
function notesOf(score) {
  return score.tracks.flatMap((t) =>
    t.staves.flatMap((st) =>
      st.bars.flatMap((bar) =>
        bar.voices.flatMap((v) => v.beats.flatMap((b) => b.notes)),
      ),
    ),
  );
}
function beatRows(score) {
  return score.tracks.flatMap((t) =>
    t.staves.flatMap((st) =>
      st.bars.flatMap((bar) => bar.voices.flatMap((v) => v.beats)),
    ),
  );
}
function assertMusicEqual(original, converted) {
  assert.equal(converted.masterBars.length, original.masterBars.length);
  assert.deepEqual(
    converted.masterBars.map((b) => b.start),
    original.masterBars.map((b) => b.start),
  );
  assert.deepEqual(
    beatRows(converted).map((b) => [
      b.duration,
      b.isEmpty,
      b.dots,
      b.tupletNumerator,
      b.tupletDenominator,
      b.lyrics,
    ]),
    beatRows(original).map((b) => [
      b.duration,
      b.isEmpty,
      b.dots,
      b.tupletNumerator,
      b.tupletDenominator,
      b.lyrics,
    ]),
  );
  const before = notesOf(original),
    after = notesOf(converted),
    locations = new Map(before.map((n, i) => [n, i])),
    afterLocations = new Map(after.map((n, i) => [n, i]));
  assert.deepEqual(
    after.map((n) => n.realValue),
    before.map((n) => n.realValue),
  );
  for (const key of [
    "slurOrigin",
    "slurDestination",
    "tieOrigin",
    "tieDestination",
    "hammerPullOrigin",
    "hammerPullDestination",
    "slideOrigin",
    "slideTarget",
  ])
    assert.deepEqual(
      after.map((n) => afterLocations.get(n[key]) ?? null),
      before.map((n) => locations.get(n[key]) ?? null),
      key,
    );
  assert.equal(new Set(after.map((n) => n.id)).size, after.length);
}
for (const filename of [
  "Dichterliebe01.musicxml",
  "Dichterliebe01.mxl",
  "Saltarello.musicxml",
  "Echigo-Jishi.musicxml",
]) {
  const file = path.join(corpusRoot, filename);
  test(
    `real score ${filename}: notes, timing, empty voices and links survive conversion`,
    { skip: !fs.existsSync(file) },
    () => {
      const bytes = fs.readFileSync(file),
        original = a.importer.ScoreLoader.loadScoreFromBytes(bytes),
        project = parseGuitarPro(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        );
      assertMusicEqual(original, toNativeScore(project));
      // Already-saved projects from before this repair must work without reimporting.
      for (const t of project.tracks)
        for (const staff of [
          { measures: t.measures },
          ...(t.additionalStaves ?? []),
        ])
          for (const m of staff.measures)
            for (const v of m.voices)
              for (const b of v.beats) {
                delete b.isEmpty;
                delete b.sourceDuration;
                for (const n of b.notes) delete n.links;
              }
      assertMusicEqual(
        original,
        toNativeScore(JSON.parse(JSON.stringify(project))),
      );
    },
  );
}
function linkedMeasure() {
  return {
    index: 0,
    voices: [
      {
        index: 0,
        beats: [
          {
            id: crypto.randomUUID(),
            duration: "q",
            isDotted: false,
            isTuplet: false,
            notes: [
              {
                id: crypto.randomUUID(),
                pitch: 60,
                isTied: false,
                source: { id: 10, slurdestinationnoteid: 11 },
              },
            ],
          },
          {
            id: crypto.randomUUID(),
            duration: "q",
            isDotted: false,
            isTuplet: false,
            notes: [
              {
                id: crypto.randomUUID(),
                pitch: 62,
                isTied: false,
                source: {
                  id: 11,
                  sluroriginnoteid: 10,
                  isslurdestination: true,
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
test("linked passage copy remaps both ends and never connects to the original notes", () => {
  const score = blankScore("Slurs", "piano", 1),
    m = linkedMeasure();
  score.tracks[0].measures = [m, freshIds(m)];
  const notes = notesOf(toNativeScore(score));
  assert.equal(notes[0].slurDestination, notes[1]);
  assert.equal(notes[2].slurDestination, notes[3]);
  assert.equal(notes[3].slurOrigin, notes[2]);
  assert.notEqual(notes[2].id, notes[0].id);
});
test("cut or deleted link endpoints do not create dangling references", () => {
  const score = blankScore("Cut", "piano", 1),
    m = linkedMeasure();
  score.tracks[0].measures = [m, freshIds(m)];
  m.voices[0].beats[0].notes = [];
  assert.doesNotThrow(() => toNativeScore(score));
  const partial = freshIds(linkedMeasure().voices[0].beats.slice(1));
  score.tracks[0].measures = [
    { index: 0, voices: [{ index: 0, beats: partial }] },
  ];
  assert.equal(notesOf(toNativeScore(score))[0].slurOrigin, null);
});
test("empty spacer durations survive and explicit rest editing makes them audible", () => {
  const score = blankScore("Pickup", "piano", 1),
    beat = score.tracks[0].measures[0].voices[0].beats[0];
  beat.source = { duration: 256, isempty: true };
  let native =
    toNativeScore(score).tracks[0].staves[0].bars[0].voices[0].beats[0];
  assert.equal(native.isEmpty, true);
  assert.equal(native.duration, 256);
  setBeatDuration(beat, "q");
  native = toNativeScore(score).tracks[0].staves[0].bars[0].voices[0].beats[0];
  assert.equal(native.isEmpty, false);
  assert.equal(native.duration, 4);
});
test("voice choices include fifth and higher imported voices without dropping creation choices", () => {
  assert.deepEqual(voiceOptions([]), [0, 1, 2, 3]);
  assert.deepEqual(
    voiceOptions([
      {
        index: 0,
        voices: Array.from({ length: 5 }, (_, index) => ({ index, beats: [] })),
      },
    ]),
    [0, 1, 2, 3, 4],
  );
  assert.ok(voiceOptions([], 7).includes(7));
});
for (const [originKey, destinationKey, originProperty, destinationProperty] of [
  ["tieoriginnoteid", "tiedestinationnoteid", "tieOrigin", "tieDestination"],
  [
    "sluroriginnoteid",
    "slurdestinationnoteid",
    "slurOrigin",
    "slurDestination",
  ],
  [
    "hammerpulloriginnoteid",
    "hammerpulldestinationnoteid",
    "hammerPullOrigin",
    "hammerPullDestination",
  ],
  ["slideoriginnoteid", "slidetargetnoteid", "slideOrigin", "slideTarget"],
])
  test(`copied ${originProperty} relationships remain local to each passage`, () => {
    const score = blankScore("Linked notes", "guitar", 1),
      m = linkedMeasure(),
      first = m.voices[0].beats[0].notes[0],
      second = m.voices[0].beats[1].notes[0];
    first.string = second.string = 0;
    first.fret = 0;
    second.fret = originProperty === "tieOrigin" ? 0 : 2;
    first.pitch = 64;
    second.pitch = 64 + second.fret;
    first.source = { id: 10, [destinationKey]: 11 };
    second.source = { id: 11, [originKey]: 10 };
    if (originProperty === "tieOrigin") second.isTied = true;
    if (originProperty === "slurOrigin") second.source.isslurdestination = true;
    if (originProperty === "hammerPullOrigin")
      first.source.ishammerpullorigin = true;
    if (originProperty === "slideOrigin")
      first.articulations = { slide: "legato" };
    score.tracks[0].measures = [m, freshIds(m)];
    const notes = notesOf(toNativeScore(score));
    assert.equal(notes[1][originProperty], notes[0]);
    assert.equal(notes[3][originProperty], notes[2]);
    assert.equal(notes[2][destinationProperty], notes[3]);
  });
