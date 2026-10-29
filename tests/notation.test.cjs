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
    beatRows(converted)
      .filter((b) => !b.isEmpty)
      .map((b) => [
        b.duration,
        b.isEmpty,
        b.dots,
        b.tupletNumerator,
        b.tupletDenominator,
        b.lyrics,
      ]),
    beatRows(original)
      .filter((b) => !b.isEmpty)
      .map((b) => [
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
      // The adapter can recover explicit cross-staff slurs that the raw
      // alphaTab importer cannot represent. Every original edge must survive.
      after.map((n, i) =>
        key.startsWith("slur") && !before[i][key]
          ? null
          : (afterLocations.get(n[key]) ?? null),
      ),
      before.map((n) => locations.get(n[key]) ?? null),
      key,
    );
  for (const note of after) {
    if (note.slurOrigin) {
      assert.equal(note.slurOrigin.slurDestination, note);
      assert.ok(
        note.slurOrigin.beat.absoluteDisplayStart <=
          note.beat.absoluteDisplayStart,
      );
    }
    if (note.slurDestination)
      assert.equal(note.slurDestination.slurOrigin, note);
  }
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

test("MusicXML retains multiple dots and ties across a measure boundary", () => {
  const score = blankScore("Tied", "piano");
  const bars = score.tracks[0].measures;
  const last = bars[0].voices[0].beats.at(-1);
  last.isDotted = true;
  last.source = { dots: 2 };
  last.notes = [{ id: crypto.randomUUID(), pitch: 60, isTied: false }];
  bars[1].voices[0].beats[0].notes = [
    { id: crypto.randomUUID(), pitch: 60, isTied: true },
  ];
  const output = exportMusicXML(score);
  assert.match(output, /<duration>1680<\/duration><tie type="start"\/>/);
  assert.match(output, /<type>quarter<\/type><dot\/><dot\/>/);
  const imported = parseGuitarPro(new TextEncoder().encode(output).buffer);
  assert.equal(
    imported.tracks[0].measures[0].voices[0].beats.at(-1).source.dots,
    2,
  );
  assert.equal(
    imported.tracks[0].measures[1].voices[0].beats[0].notes[0].isTied,
    true,
  );
});

test("MusicXML assigns distinct voices when a staff has more than four", () => {
  const score = blankScore("Voices", "piano");
  const track = score.tracks[0];
  const template = track.measures[0].voices[0];
  for (let i = 1; i < 5; i++)
    track.measures[0].voices.push(structuredClone(template));
  track.additionalStaves = [
    { measures: blankScore("", "piano").tracks[0].measures },
  ];
  const output = exportMusicXML(score);
  assert.match(output, /<voice>5<\/voice>.*?<staff>1<\/staff>/);
  assert.match(output, /<voice>6<\/voice>.*?<staff>2<\/staff>/);
});

test("MIDI rejects truncated system events", () => {
  const bytes = Uint8Array.from([
    77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, 0, 0, 0,
    4, 0, 240, 5, 1,
  ]);
  assert.throws(
    () => parseMidi(bytes.buffer, "bad.mid"),
    /Truncated MIDI system event/,
  );
});

test("MIDI keeps short notes rounded beyond the last original tick", () => {
  const bytes = Uint8Array.from([
    77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, 0, 0, 0,
    12, 60, 0x90, 60, 100, 1, 0x80, 60, 0, 0, 0xff, 0x2f, 0,
  ]);
  const score = parseMidi(bytes.buffer, "short.mid");
  const beats = score.tracks[0].measures[0].voices[0].beats;
  assert.equal(beats[1].notes[0].pitch, 60);
});

test("MusicXML exports subtitle, source credits and separate lyric verses safely", () => {
  const score = blankScore("Title & tune", "piano");
  score.subTitle = "Part <Two>";
  score.artist = "Composer & Co";
  score.source = { words: "Poet & Co", copyright: "© 2026" };
  const beat = score.tracks[0].measures[0].voices[0].beats[0];
  beat.notes = [{ id: crypto.randomUUID(), pitch: 60, isTied: false }];
  beat.lyrics = ["first &", "second <verse>"];
  const output = exportMusicXML(score);
  assert.match(
    output,
    /<credit-type>subtitle<\/credit-type><credit-words>Part &lt;Two&gt;<\/credit-words>/,
  );
  assert.match(output, /<creator type="lyricist">Poet &amp; Co<\/creator>/);
  assert.match(output, /<rights>© 2026<\/rights>/);
  assert.match(output, /<lyric number="1"><text>first &amp;<\/text><\/lyric>/);
  assert.match(
    output,
    /<lyric number="2"><text>second &lt;verse&gt;<\/text><\/lyric>/,
  );
  const imported = parseGuitarPro(new TextEncoder().encode(output).buffer);
  assert.equal(imported.subTitle.replace(/\u00a0/g, " "), score.subTitle);
  assert.deepEqual(
    imported.tracks[0].measures[0].voices[0].beats[0].lyrics.map((line) =>
      line.replace(/\u00a0/g, " "),
    ),
    beat.lyrics,
  );
});

test("bundled examples load as editable scores with their intended instruments", () => {
  const { makeExample } = require("../src/utils/examples.ts");
  for (const [id, file, type, program] of [
    ["czerny", "czerny-op821-1.mid", "piano", 0],
    ["greensleeves", "greensleaves.mid", "guitar", 24],
  ]) {
    const bytes = fs.readFileSync(`public/examples/${file}`);
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const score = makeExample(id, buffer);
    assert.ok(
      score.tracks.every(
        (track) => track.type === type && track.midiProgram === program,
      ),
    );
    assert.ok(
      score.tracks.flatMap((track) =>
        track.measures.flatMap((measure) =>
          measure.voices.flatMap((voice) =>
            voice.beats.flatMap((beat) => beat.notes),
          ),
        ),
      ).length > 0,
    );
    assert.equal(toNativeScore(score).tracks[0].playbackInfo.program, program);
    assert.notEqual(score.id, makeExample(id, buffer).id);
  }
  const drums = makeExample("drums");
  const native = toNativeScore(drums);
  assert.equal(native.tracks[0].staves[0].isPercussion, true);
  assert.equal(native.tracks[0].playbackInfo.primaryChannel, 9);
  assert.deepEqual(
    [
      ...new Set(
        drums.tracks[0].measures.flatMap((measure) =>
          measure.voices[0].beats.flatMap((beat) =>
            beat.notes.map((note) => note.pitch),
          ),
        ),
      ),
    ].sort((a, b) => a - b),
    [36, 38, 42],
  );
});

test("piano and percussion override a saved guitar palette when switching instruments", () => {
  const { instrumentSidebarMode } = require("../src/utils/sidebarMode.ts");
  for (const mode of ["guitar", "both", "staff"]) {
    assert.equal(instrumentSidebarMode("piano", mode), "staff");
    assert.equal(instrumentSidebarMode("percussion", mode), "staff");
    assert.equal(instrumentSidebarMode("guitar", mode), mode);
    assert.equal(instrumentSidebarMode("bass", mode), mode);
  }
});

test("piano example renders both hands as one grand staff and legacy copies show both tracks", () => {
  const { makeExample } = require("../src/utils/examples.ts");
  const { displayedTrackIndexes } = require("../src/utils/pianoParts.ts");
  const bytes = fs.readFileSync("public/examples/czerny-op821-1.mid");
  const score = makeExample(
    "czerny",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  assert.equal(score.tracks.length, 1);
  assert.equal(score.tracks[0].additionalStaves.length, 1);
  const native = toNativeScore(score);
  assert.equal(native.tracks[0].staves.length, 2);
  assert.ok(
    native.tracks[0].staves.every((staff) =>
      staff.bars.some((bar) =>
        bar.voices.some((voice) =>
          voice.beats.some((beat) => beat.notes.length),
        ),
      ),
    ),
  );
  const legacy = structuredClone(score);
  legacy.tracks = [
    { ...score.tracks[0], name: "Piano · upper", id: "upper" },
    { ...score.tracks[0], name: "Piano · lower", id: "lower" },
  ];
  assert.deepEqual(displayedTrackIndexes(legacy, "upper"), [0, 1]);
  assert.deepEqual(displayedTrackIndexes(legacy, "lower"), [0, 1]);
});

test("Chopin examples retain every imported note and both piano hands", () => {
  const { makeExample } = require("../src/utils/examples.ts");
  const notes = (measures) =>
    measures.flatMap((m) =>
      m.voices.flatMap((v) => v.beats.flatMap((b) => b.notes)),
    ).length;
  for (const number of [4, 15, 20]) {
    const bytes = fs.readFileSync(`public/examples/chopin-op28-${number}.mid`);
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const source = parseMidi(buffer, "source");
    const score = makeExample(`chopin-${number}`, buffer);
    assert.equal(score.artist, "Frédéric Chopin");
    assert.equal(score.tracks.length, 1);
    const track = score.tracks[0];
    assert.equal(track.type, "piano");
    assert.equal(track.midiProgram, 0);
    assert.equal(track.additionalStaves.length, 1);
    assert.equal(
      notes(track.measures) + notes(track.additionalStaves[0].measures),
      source.tracks.reduce((sum, t) => sum + notes(t.measures), 0),
    );
    assert.equal(track.measures.length, source.tracks[0].measures.length);
    assert.equal(
      track.additionalStaves[0].measures.length,
      source.tracks[1].measures.length,
    );
    assert.equal(toNativeScore(score).tracks[0].staves.length, 2);
  }
});

test("C minor prelude playback includes every event from both piano hands", () => {
  const { makeExample } = require("../src/utils/examples.ts");
  const bytes = fs.readFileSync("public/examples/chopin-op28-20.mid");
  const score = makeExample(
    "chopin-20",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const events = (source) => {
    const notes = [];
    const handler = new Proxy(
      {},
      {
        get: (_, key) =>
          key === "addNote" ? (...args) => notes.push(args) : () => {},
      },
    );
    new a.midi.MidiFileGenerator(
      toNativeScore(source),
      null,
      handler,
    ).generate();
    return notes.map((note) => JSON.stringify(note)).sort();
  };
  const upper = structuredClone(score);
  upper.tracks[0].additionalStaves = [];
  const lower = structuredClone(score);
  lower.tracks[0].measures = lower.tracks[0].additionalStaves[0].measures;
  lower.tracks[0].additionalStaves = [];
  const upperEvents = events(upper),
    lowerEvents = events(lower);
  assert.equal(upperEvents.length, 186);
  assert.equal(lowerEvents.length, 100);
  assert.deepEqual(events(score), [...upperEvents, ...lowerEvents].sort());
  assert.ok(lowerEvents.some((event) => JSON.parse(event)[3] === 36));
});
