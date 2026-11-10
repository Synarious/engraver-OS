const fs = require("node:fs");
const ts = require("typescript");
const assert = require("node:assert/strict");
const { test } = require("node:test");

require.extensions[".ts"] = (module, file) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    file,
  );

const { blankScore, rest } = require("../src/utils/project.ts");
const { checkScore } = require("../src/utils/scoreCheck.ts");
const { enterStep } = require("../src/utils/stepEntry.ts");
const { beatDurationTicks } = require("../src/utils/scoreRhythm.ts");

test("step entry splits and combines blank beats without shifting later notes", () => {
  const score = blankScore("Step entry", "guitar");
  const track = score.tracks[0],
    voice = track.measures[0].voices[0];
  const location = (beatId) => ({
    trackId: track.id,
    staffIndex: 0,
    measureIndex: 0,
    voiceIndex: 0,
    beatId,
  });
  const first = voice.beats[0].id;
  enterStep(score, location(first), "e", 64);
  assert.deepEqual(
    voice.beats.map((beat) => beat.duration),
    ["e", "e", "q", "q", "q"],
  );
  assert.equal(voice.beats[0].notes[0].fret, 0);
  enterStep(score, location(voice.beats[1].id), "h", 60);
  assert.equal(
    voice.beats.reduce((sum, beat) => sum + beatDurationTicks(beat), 0),
    3840,
  );
  const snapshot = structuredClone(score);
  assert.throws(
    () => enterStep(score, location(first), "q", 65),
    /Choose a rest/,
  );
  assert.deepEqual(score, snapshot);
});

const beat = (duration, values = {}) => ({ ...rest(), duration, ...values });
const note = (pitch, values = {}) => ({
  id: crypto.randomUUID(),
  pitch,
  isTied: false,
  ...values,
});

test("score check finds the first beat that overflows each voice in the rendered meter", () => {
  const score = blankScore("Rhythm", "piano", 2);
  const track = score.tracks[0];
  track.measures[1].timeSignature = [6, 8];
  const grace = beat("q", { source: { gracetype: 1 }, notes: [note(60)] });
  const spacer = beat("w", { isEmpty: true });
  const dotted = beat("q", { isDotted: true });
  const triplets = Array.from({ length: 3 }, () =>
    beat("e", { isTuplet: true }),
  );
  const eighth = beat("e");
  const additional = beat("e", { notes: [note(62)] });
  track.measures[1].voices = [
    { index: 0, beats: [grace, spacer, dotted, ...triplets, eighth] },
    { index: 1, beats: [dotted, ...triplets, eighth, additional, beat("q")] },
  ];
  const before = structuredClone(score);
  const findings = checkScore(score);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "rhythm");
  assert.match(findings[0].detail, /6\/8/);
  assert.deepEqual(findings[0].location, {
    trackId: track.id,
    staffIndex: 0,
    measureIndex: 1,
    voiceIndex: 1,
    beatId: additional.id,
  });
  assert.deepEqual(score, before);
});

test("score check allows pickups, free time, full-bar rests and imported display durations", () => {
  const score = blankScore("Irregular", "piano", 5);
  const [pickup, freeTime, implicit, fullBar, override] =
    score.tracks[0].measures;
  for (const measure of score.tracks[0].measures)
    measure.timeSignature = [3, 4];
  pickup.masterSource = { isanacrusis: true };
  freeTime.masterSource = { isfreetime: true };
  implicit.source = { musicxml: { implicit: "yes" } };
  fullBar.voices[0].beats = [beat("w")];
  override.voices[0].beats = [
    beat("w", {
      notes: [note(60)],
      source: { overridedisplayduration: 2880 },
    }),
  ];
  assert.deepEqual(checkScore(score), []);
});

test("tablature check uses each staff’s tuning and ignores unassigned or dead notes", () => {
  const score = blankScore("Double-neck", "guitar", 1);
  const track = score.tracks[0];
  const staff = {
    source: { stringtuning: { tunings: [55, 50, 45, 40] } },
    measures: blankScore("Bass", "bass", 1).tracks[0].measures,
  };
  track.additionalStaves = [staff];
  const target = staff.measures[0].voices[0].beats[0];
  const mismatch = note(53, { string: 1, fret: 2 });
  const outOfRange = note(40, { string: 4, fret: 0 });
  target.notes = [
    note(55, { string: 0 }),
    note(40, { string: 1, fret: -1 }),
    note(60),
    mismatch,
    outOfRange,
  ];
  assert.deepEqual(
    checkScore(score).map(({ kind, location }) => ({
      kind,
      staffIndex: location.staffIndex,
      noteId: location.noteId,
    })),
    [mismatch, outOfRange].map(({ id }) => ({
      kind: "tablature",
      staffIndex: 1,
      noteId: id,
    })),
  );
});
