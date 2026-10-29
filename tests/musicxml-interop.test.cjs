const fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript"),
  assert = require("node:assert/strict"),
  { test } = require("node:test"),
  { spawnSync } = require("node:child_process");
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
const { blankScore } = require("../src/utils/project.ts"),
  { exportMusicXML } = require("../src/utils/musicxml.ts"),
  { parseGuitarPro, toNativeScore } = require("../src/utils/alphaTabParser.ts"),
  {
    parseXML,
    prepareMusicXML,
    compressMusicXML,
  } = require("../src/utils/musicxmlDocument.ts");
const a = require("@coderline/alphatab");
const load = (value) => {
  const b = typeof value === "string" ? Buffer.from(value) : value;
  return parseGuitarPro(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  );
};
const fixture = (type = "piano", count = 2) => {
  const s = blankScore("Interchange & validation", type, count);
  for (const m of s.tracks[0].measures)
    for (const b of m.voices[0].beats)
      b.notes = [
        {
          id: crypto.randomUUID(),
          pitch: type === "percussion" ? 38 : type === "guitar" ? 64 : 60,
          isTied: false,
          ...(type === "guitar" ? { fret: 0, string: 0 } : {}),
        },
      ];
  return s;
};
const notes = (n) =>
  n.tracks.flatMap((t) =>
    t.staves.flatMap((s) =>
      s.bars.flatMap((m) =>
        m.voices.flatMap((v) => v.beats.flatMap((b) => b.notes)),
      ),
    ),
  );
const sound = (s) => notes(toNativeScore(s)).map((n) => n.realValue);
const playback = (s) => {
  const result = [];
  new a.midi.MidiFileGenerator(
    toNativeScore(s),
    null,
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === "addNote"
            ? (...args) => result.push(args.slice(0, 5))
            : () => {},
      },
    ),
  ).generate();
  return result.sort((a, b) => a[1] - b[1] || a[3] - b[3]);
};
const bundled = path.join(
  require("node:os").homedir(),
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
);
const python =
  process.env.MUSICXML_PYTHON || (fs.existsSync(bundled) ? bundled : "python");
const hasSchema =
  spawnSync(python, ["-c", "import lxml"], { encoding: "utf8" }).status === 0;
function validate(s) {
  const xml = exportMusicXML(s);
  const r = spawnSync(
    python,
    [path.join(__dirname, "../scripts/validate-musicxml.py")],
    { input: xml, encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  return xml;
}

test(
  "every basic instrument exports MusicXML 4.0 conforming structure",
  { skip: !hasSchema },
  () => {
    for (const type of ["piano", "guitar", "bass", "percussion"])
      validate(fixture(type));
  },
);
test("pitch, authored keys, imported clefs and transposition survive XML", () => {
  const s = fixture();
  s.tracks[0].source = { staves: [{ transpositionpitch: 12 }] };
  s.tracks[0].measures[0].clef = "bass";
  s.tracks[0].measures[0].keySignature = "G";
  const r = load(exportMusicXML(s));
  assert.deepEqual(sound(r), sound(s));
  assert.equal(toNativeScore(r).tracks[0].staves[0].bars[0].clef, 3);
  assert.equal(toNativeScore(r).tracks[0].staves[0].bars[0].keySignature, 1);
  assert.match(exportMusicXML(r), /<sign>F<\/sign>/);
});
test("five successive XML and MXL cycles keep piano voices and playback stable", () => {
  let s = fixture();
  s.tracks[0].additionalStaves = [
    { measures: structuredClone(s.tracks[0].measures) },
  ];
  const pitches = sound(s);
  for (let i = 0; i < 5; i++) {
    s = load(i % 2 ? compressMusicXML(exportMusicXML(s)) : exportMusicXML(s));
    assert.deepEqual(sound(s), pitches);
    assert.equal(s.tracks[0].measures[0].voices.length, 1);
    assert.equal(s.tracks[0].additionalStaves[0].measures[0].voices.length, 1);
  }
});
test("drum identity, mix and channel survive XML", () => {
  const s = fixture("percussion");
  s.tracks[0].volume = 0.5;
  s.tracks[0].pan = -0.5;
  const xml = exportMusicXML(s),
    r = load(xml);
  assert.match(xml, /<unpitched>/);
  assert.match(xml, /<midi-unpitched>39/);
  assert.deepEqual(sound(r), sound(s));
  assert.equal(r.tracks[0].type, "percussion");
  assert.ok(Math.abs(r.tracks[0].volume - 0.5) < 0.07);
  assert.ok(Math.abs(r.tracks[0].pan + 0.5) < 0.13);
});
test("grace notes, pedal, wedges, tempo maps and harmony are exported and reimported", () => {
  const s = fixture(),
    m = s.tracks[0].measures[0],
    b = m.voices[0].beats[0];
  b.source = { gracetype: 2, crescendo: 1 };
  b.duration = "s";
  m.voices[0].beats[1].source = { crescendo: 1 };
  b.chord = { name: "Dbmaj7/Ab", strings: [-1, 3, 2, 0, 1, 0], firstFret: 1 };
  m.source = {
    sustainpedals: [
      { ratioposition: 0, pedaltype: 0 },
      { ratioposition: 0.75, pedaltype: 2 },
    ],
  };
  m.masterSource = {
    tempoautomations: [
      { value: 120, ratioposition: 0, type: 0 },
      { value: 60, ratioposition: 0.5, type: 0 },
    ],
  };
  const xml = exportMusicXML(s),
    r = load(xml),
    native = toNativeScore(r);
  assert.match(xml, /<grace/);
  assert.match(xml, /<pedal/);
  assert.match(xml, /<wedge/);
  assert.match(xml, /<harmony/);
  assert.equal(native.masterBars[0].tempoAutomations.length, 2);
  assert.equal(
    native.tracks[0].staves[0].bars[0].voices[0].beats[0].graceType,
    2,
  );
  if (hasSchema) validate(s);
});
test("timewise documents and named voices use the full metadata importer", () => {
  const xml =
    '<?xml version="1.0"?><score-timewise version="4.0"><part-list><score-part id="P"><part-name>Voice</part-name></score-part></part-list><measure number="1"><part id="P"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note dynamics="50"><pitch><step>D</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><voice>melody</voice><type>whole</type><lyric number="verse"><syllabic>begin</syllabic><text>Hel</text></lyric></note></part></measure></score-timewise>';
  const s = load(xml),
    b = s.tracks[0].measures[0].voices[0].beats[0];
  assert.equal(b.notes[0].velocity, 45);
  assert.equal(b.lyricDetails[0].syllabic, "begin");
  assert.match(exportMusicXML(s), /<step>D<\/step><alter>-1<\/alter>/);
});
test("repeat ending bitsets and navigation directions retain their semantics", () => {
  const s = fixture("piano", 4);
  const m = s.tracks[0].measures;
  m[0].repeatStart = true;
  m[1].alternateEndings = 5;
  m[1].repeatCount = 3;
  m[2].alternateEndings = 2;
  m[0].masterSource = { directions: [1] };
  m[3].masterSource = { directions: [12] };
  const xml = exportMusicXML(s);
  assert.match(xml, /<ending number="1,3" type="start"/);
  assert.match(xml, /dalsegno="segno"/);
  const r = load(xml);
  assert.equal(r.tracks[0].measures[1].alternateEndings, 5);
  if (hasSchema) validate(s);
});
test("standard guitar effects and linked slurs survive export and reimport", () => {
  const s = fixture("guitar"),
    beats = s.tracks[0].measures[0].voices[0].beats;
  const n = beats[0].notes[0],
    end = beats[1].notes[0];
  n.links = {
    slurdestinationnoteid: end.id,
    hammerpulldestinationnoteid: end.id,
    slidetargetnoteid: end.id,
  };
  end.links = {
    sluroriginnoteid: n.id,
    hammerpulloriginnoteid: n.id,
    slideoriginnoteid: n.id,
  };
  n.articulations = { slide: "legato", palmMute: true };
  n.source = {
    ishammerpullorigin: true,
    slideouttype: 2,
    bendtype: 1,
    bendpoints: [
      { offset: 0, value: 0 },
      { offset: 60, value: 4 },
    ],
    ornament: 2,
    vibrato: 1,
  };
  beats[0].source = { tremolopicking: { marks: 2, style: 0 } };
  const xml = exportMusicXML(s),
    r = load(xml),
    note = notes(toNativeScore(r))[0];
  for (const tag of ["slur", "slide", "hammer-on", "bend", "turn", "tremolo"])
    assert.ok(xml.includes(`<${tag}`), tag);
  assert.ok(note.slurDestination);
  assert.ok(note.slideTarget);
  assert.ok(note.hammerPullDestination);
  assert.equal(note.hasBend, true);
  if (hasSchema) validate(s);
});

for (const filename of [
  "Dichterliebe01.musicxml",
  "Saltarello.musicxml",
  "Echigo-Jishi.musicxml",
]) {
  test(
    `real score ${filename}: XML schema and generated playback survive export`,
    {
      skip: !fs.existsSync(
        path.join(__dirname, "../review-artifacts/song-import", filename),
      ),
    },
    () => {
      const s = load(
        fs.readFileSync(
          path.join(__dirname, "../review-artifacts/song-import", filename),
        ),
      );
      const xml = hasSchema ? validate(s) : exportMusicXML(s);
      assert.deepEqual(playback(load(xml)), playback(s));
    },
  );
}
test("cross-measure pedal release, advanced navigation, swing and slash chords survive", () => {
  const s = fixture(),
    m = s.tracks[0].measures;
  m[0].source = { sustainpedals: [{ pedaltype: 0, ratioposition: 0.5 }] };
  m[1].source = { sustainpedals: [{ pedaltype: 2, ratioposition: 0.25 }] };
  m[1].masterSource = { directions: [12], tripletfeel: 1 };
  m[0].voices[0].beats[0].chord = { name: "Dbmaj7/Ab" };
  const xml = hasSchema ? validate(s) : exportMusicXML(s),
    r = load(xml),
    n = toNativeScore(r);
  assert.equal(n.tracks[0].staves[0].bars[1].sustainPedals[0].pedalType, 2);
  assert.equal(n.masterBars[1].tripletFeel, 1);
  assert.ok(r.tracks[0].measures[1].masterSource.directions.includes(12));
  assert.equal(
    r.tracks[0].measures[0].voices[0].beats[0].chord.name,
    "Dbmaj7/Ab",
  );
});
test("page geometry, source lyric positions and elisions survive XML interchange", () => {
  const xml = exportMusicXML(fixture())
    .replace(
      "<part-list>",
      "<defaults><page-layout><page-height>1600</page-height><page-width>1200</page-width></page-layout></defaults><part-list>",
    )
    .replace(
      '<measure number="2">',
      '<measure number="2"><print new-page="yes"/>',
    )
    .replace(
      "</notations>",
      '</notations><lyric default-y="-80" relative-x="3" number="1"><syllabic>single</syllabic><text>one</text><elision> </elision><syllabic>single</syllabic><text>two</text></lyric>',
    );
  // The fixture may have no notations: attach to the first note instead.
  const withLyric = xml.includes("<lyric")
    ? xml
    : xml.replace(
        "</note>",
        '<lyric default-y="-80" relative-x="3" number="1"><syllabic>single</syllabic><text>one</text><elision> </elision><syllabic>single</syllabic><text>two</text></lyric></note>',
      );
  const s = load(withLyric),
    out = exportMusicXML(s);
  assert.match(out, /<page-height>1600/);
  assert.match(out, /new-page="yes"/);
  assert.match(out, /default-y="-80"/);
  assert.match(out, /<elision>/);
  if (hasSchema) validate(s);
});
test("unison chord notes retain separate attacks and large scores use distinct MIDI ports", () => {
  const s = fixture(),
    b = s.tracks[0].measures[0].voices[0].beats[0];
  b.notes.push({ ...b.notes[0], id: crypto.randomUUID() });
  b.notes[0].velocity = 20;
  b.notes[0].velocityOverride = true;
  b.notes[1].velocity = 110;
  b.notes[1].velocityOverride = true;
  const r = load(exportMusicXML(s));
  assert.deepEqual(
    r.tracks[0].measures[0].voices[0].beats[0].notes.map((n) => n.velocity),
    [20, 110],
  );
  s.tracks = Array.from({ length: 16 }, (_, i) => ({
    ...structuredClone(s.tracks[0]),
    id: crypto.randomUUID(),
    name: `Instrument ${i}`,
  }));
  const xml = hasSchema ? validate(s) : exportMusicXML(s);
  assert.match(xml, /<midi-device id="I16" port="2"/);
});

test("long notes, complex tuplets and microtonal spelling remain valid interchange", () => {
  const s = fixture();
  const m = s.tracks[0].measures[0];
  m.timeSignature = [8, 4];
  m.voices[0].beats = [
    { ...m.voices[0].beats[0], duration: "q", sourceDuration: -2 },
  ];
  const tuplet = s.tracks[0].measures[1].voices[0].beats[0];
  tuplet.isTuplet = true;
  tuplet.tuplet = [7, 4];
  const out = hasSchema ? validate(s) : exportMusicXML(s);
  assert.match(out, /<duration>7680<\/duration>/);
  assert.match(out, /<type>breve/);
  assert.match(out, /<actual-notes>7/);
  const xml = exportMusicXML(fixture()).replace(
    "<step>C</step>",
    "<step>C</step><alter>0.5</alter>",
  );
  const r = load(xml);
  assert.match(exportMusicXML(r), /<alter>0.5<\/alter>/);
  assert.ok(r.interchange.warnings.some((w) => w.includes("Microtonal")));
});
test("cross-staff slur links do not depend on renderer traversal IDs", () => {
  const s = fixture();
  s.tracks[0].additionalStaves = [
    { measures: structuredClone(fixture().tracks[0].measures) },
  ];
  const origin =
      s.tracks[0].additionalStaves[0].measures[0].voices[0].beats[0].notes[0],
    destination = s.tracks[0].measures[1].voices[0].beats[0].notes[0];
  origin.links = { slurdestinationnoteid: destination.id };
  destination.links = { sluroriginnoteid: origin.id };
  const native = toNativeScore(s);
  assert.ok(
    native.tracks[0].staves[0].bars[1].voices[0].beats[0].notes[0].slurOrigin,
  );
  const r = load(exportMusicXML(s));
  assert.ok(
    toNativeScore(r).tracks[0].staves[0].bars[1].voices[0].beats[0].notes[0]
      .slurOrigin,
  );
});
