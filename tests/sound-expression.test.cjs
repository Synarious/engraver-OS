const fs = require("node:fs");
const ts = require("typescript");
const assert = require("node:assert/strict");
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
const { parseMidi } = require("../src/utils/midi.ts");
const { toNativeScore } = require("../src/utils/alphaTabParser.ts");
const a = require("@coderline/alphatab");

test("MIDI attack velocities survive import and reach individual playback notes", () => {
  // Two simultaneous notes, followed by note-offs and an unfinished attack.
  const events = [
    0, 0x90, 60, 20, 0, 0x90, 64, 110, 0x60, 0x80, 60, 0, 0, 0x80, 64, 0, 0,
    0x90, 67, 50, 0x60, 0xff, 0x2f, 0,
  ];
  const bytes = Buffer.from([
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    0,
    96,
    0x4d,
    0x54,
    0x72,
    0x6b,
    0,
    0,
    0,
    events.length,
    ...events,
  ]);
  const score = parseMidi(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "expression.mid",
  );
  const beats = score.tracks[0].measures[0].voices[0].beats;
  assert.deepEqual(
    beats[0].notes.map((n) => n.velocity),
    [20, 110],
  );
  assert.equal(beats[4].notes[0].velocity, 50);
  const native = toNativeScore(score);
  const nativeNotes =
    native.tracks[0].staves[0].bars[0].voices[0].beats[0].notes;
  assert.deepEqual(
    nativeNotes.map((n) => n.dynamics),
    [0, 6],
  );
  const generated = [];
  const handler = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "addNote" ? (...args) => generated.push(args) : () => {},
    },
  );
  new a.midi.MidiFileGenerator(native, null, handler).generate();
  assert.deepEqual(
    generated.filter((e) => e[3] === 60 || e[3] === 64).map((e) => e[4]),
    [15, 111],
  );
  beats[0].dynamics = "f";
  assert.deepEqual(
    toNativeScore(
      score,
    ).tracks[0].staves[0].bars[0].voices[0].beats[0].notes.map(
      (n) => n.dynamics,
    ),
    [5, 5],
  );
});

