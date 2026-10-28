require("fake-indexeddb/auto");
const fs = require("node:fs"),
  ts = require("typescript"),
  assert = require("node:assert/strict"),
  { test, after } = require("node:test");
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
const alpha = require("@coderline/alphatab");
global.window = new EventTarget();
global.BroadcastChannel = undefined;
const { useEditorStore } = require("../src/store/editorStore.ts"),
  { blankScore } = require("../src/utils/project.ts"),
  { applyNotationView, scoreBeats } = require("../src/utils/scoreSelection.ts"),
  { toNativeScore } = require("../src/utils/alphaTabParser.ts"),
  { flushSaves } = require("../src/storage/fileSystem.ts"),
  {
    scoreTargets,
    nearestScoreNote,
  } = require("../src/utils/scoreHitTargets.ts");
after(async () => await flushSaves());
const {
  insertScoreNote,
  moveScoreNote,
  shiftStaffPitch,
} = require("../src/utils/scoreGestures.ts");
test("double-click insertion and dragging on the bass staff are undoable and preserve note identity", () => {
  const score = setup(),
    state = useEditorStore.getState();
  const from = location(score, 1, 1, 0);
  let id;
  state.editScore((draft) => {
    id = insertScoreNote(draft, from, 52);
  });
  const to = location(score, 1, 1, 1);
  state.editScore((draft) =>
    moveScoreNote(draft, { ...from, noteId: id }, to, 1),
  );
  let st = useEditorStore.getState().score.tracks[1].additionalStaves[0];
  assert.equal(st.measures[0].voices[0].beats[1].notes[0].id, id);
  assert.equal(st.measures[0].voices[0].beats[1].notes[0].pitch, 53);
  assert.equal(st.measures[0].voices[0].beats[0].notes.length, 1);
  state.undo();
  st = useEditorStore.getState().score.tracks[1].additionalStaves[0];
  assert.equal(st.measures[0].voices[0].beats[0].notes[1].id, id);
  state.undo();
  assert.equal(
    useEditorStore.getState().score.tracks[1].additionalStaves[0].measures[0]
      .voices[0].beats[0].notes.length,
    1,
  );
});
test("staff dragging follows line and space pitches and rejects occupied destinations atomically", () => {
  assert.equal(shiftStaffPitch(64, 1), 65);
  assert.equal(shiftStaffPitch(71, 1), 72);
  assert.equal(shiftStaffPitch(60, -1), 59);
  const score = setup(),
    state = useEditorStore.getState(),
    before = state.score;
  assert.throws(
    () =>
      state.editScore((draft) =>
        moveScoreNote(draft, location(score), location(score, 0, 0, 1), 3),
      ),
    /already occupies/,
  );
  assert.equal(useEditorStore.getState().score, before);
});
function setup() {
  const score = blankScore("Edit test", "guitar", 2),
    t = score.tracks[0];
  t.measures[0].voices[0].beats[0].notes = [
    { id: crypto.randomUUID(), pitch: 64, string: 0, fret: 0, isTied: false },
    { id: crypto.randomUUID(), pitch: 67, string: 1, fret: 8, isTied: false },
  ];
  t.measures[0].voices[0].beats[1].notes = [
    { id: crypto.randomUUID(), pitch: 69, string: 0, fret: 5, isTied: false },
  ];
  const piano = blankScore("Piano", "piano", 2).tracks[0];
  piano.additionalStaves = [
    { measures: blankScore("Bass staff", "piano", 2).tracks[0].measures },
  ];
  piano.additionalStaves[0].measures[0].voices[0].beats[0].notes = [
    { id: crypto.randomUUID(), pitch: 48, isTied: false },
  ];
  score.tracks.push(piano);
  useEditorStore.getState().setScore(score, false);
  useEditorStore.getState().setMultiSelect(false);
  return score;
}
const location = (score, track = 0, staff = 0, beat = 0, note = 0) => {
  const t = score.tracks[track],
    st = staff ? t.additionalStaves[staff - 1] : t,
    b = st.measures[0].voices[0].beats[beat];
  return {
    trackId: t.id,
    staffIndex: staff,
    measureIndex: 0,
    voiceIndex: 0,
    beatId: b.id,
    noteId: b.notes[note]?.id ?? null,
  };
};
test("click selection is atomic across tracks/staves and does not change music or history", () => {
  const score = setup(),
    store = useEditorStore.getState(),
    before = store.score;
  let notifications = 0;
  const unsubscribe = useEditorStore.subscribe(() => notifications++);
  store.selectLocation(location(score, 1, 1));
  unsubscribe();
  const s = useEditorStore.getState();
  assert.equal(notifications, 1);
  assert.equal(s.activeTrackId, score.tracks[1].id);
  assert.equal(s.activeStaffIndex, 1);
  assert.equal(s.activeNoteId, location(score, 1, 1).noteId);
  assert.deepEqual(s.selectedNoteIds, [location(score, 1, 1).noteId]);
  assert.equal(s.score, before);
  assert.equal(s.history.length, 1);
});
test("ctrl selection and shift ranges keep chord notes and selected beats", () => {
  const score = setup(),
    s = useEditorStore.getState();
  s.selectLocation(location(score));
  s.selectLocation(location(score, 0, 0, 1), "toggle");
  assert.equal(useEditorStore.getState().selectedNoteIds.length, 2);
  s.selectLocation(location(score, 0, 0, 1), "toggle");
  assert.equal(useEditorStore.getState().selectedNoteIds.length, 1);
  s.selectLocation(location(score));
  s.selectLocation(location(score, 0, 0, 1), "range");
  assert.equal(useEditorStore.getState().selectedNoteIds.length, 3);
  assert.equal(useEditorStore.getState().selectedBeatIds.length, 2);
});
test("multi-note fret/pitch and rhythm edits form one undoable change", () => {
  const score = setup(),
    s = useEditorStore.getState();
  s.selectLocation(location(score));
  s.selectLocation(location(score, 0, 0, 1), "range");
  s.updateSelection({
    semitones: 1,
    duration: "e",
    dotted: true,
    dynamics: "p",
  });
  let state = useEditorStore.getState(),
    notes = state.score.tracks[0].measures[0].voices[0].beats.flatMap(
      (b) => b.notes,
    );
  assert.deepEqual(
    notes.map((n) => n.pitch),
    [65, 68, 70],
  );
  assert.equal(state.history.length, 2);
  assert.equal(state.selectedNoteIds.length, 3);
  s.undo();
  assert.deepEqual(
    useEditorStore
      .getState()
      .score.tracks[0].measures[0].voices[0].beats.flatMap((b) => b.notes)
      .map((n) => n.pitch),
    [64, 67, 69],
  );
  assert.equal(useEditorStore.getState().selectedNoteIds.length, 3);
  s.redo();
  assert.equal(
    useEditorStore.getState().score.tracks[0].measures[0].voices[0].beats[0]
      .duration,
    "e",
  );
});
test("invalid edits roll back without modifying selected music or undo history", () => {
  const score = setup(),
    s = useEditorStore.getState();
  s.selectLocation(location(score));
  const before = useEditorStore.getState().score;
  assert.throws(() => s.updateSelection({ fret: 99 }), /valid string/);
  assert.equal(useEditorStore.getState().score, before);
  assert.equal(useEditorStore.getState().history.length, 1);
});
test("lower piano staff editing leaves upper staff and other instruments unchanged", () => {
  const score = setup(),
    s = useEditorStore.getState();
  s.selectLocation(location(score, 1, 1));
  s.updateSelection({ pitch: 50 });
  const state = useEditorStore.getState();
  assert.equal(
    state.score.tracks[1].additionalStaves[0].measures[0].voices[0].beats[0]
      .notes[0].pitch,
    50,
  );
  assert.equal(
    state.score.tracks[0].measures[0].voices[0].beats[0].notes[0].pitch,
    64,
  );
});
test("copy/paste and deletion operate only on selected notes and preserve source identities", () => {
  const score = setup(),
    s = useEditorStore.getState();
  s.selectLocation(location(score));
  s.copySelection();
  s.selectLocation(location(score, 0, 0, 2));
  s.pasteSelection();
  let state = useEditorStore.getState(),
    pasted = state.score.tracks[0].measures[0].voices[0].beats[2].notes[0];
  assert.equal(pasted.pitch, 64);
  assert.notEqual(pasted.id, location(score).noteId);
  s.deleteSelection();
  assert.equal(
    useEditorStore.getState().score.tracks[0].measures[0].voices[0].beats[0]
      .notes.length,
    2,
  );
  assert.equal(
    useEditorStore.getState().score.tracks[0].measures[0].voices[0].beats[2]
      .notes.length,
    0,
  );
  s.undo();
  assert.equal(
    useEditorStore.getState().score.tracks[0].measures[0].voices[0].beats[2]
      .notes.length,
    1,
  );
});
test("inserting on an occupied guitar string keeps the note identity and selects the new value", () => {
  const score = setup(),
    s = useEditorStore.getState();
  s.selectLocation(location(score));
  s.insertSelectionNote(64, 0, 7);
  const state = useEditorStore.getState(),
    notes = state.score.tracks[0].measures[0].voices[0].beats[0].notes;
  assert.equal(notes.length, 2);
  assert.equal(notes[0].id, location(score).noteId);
  assert.equal(notes[0].fret, 7);
  assert.equal(state.activeNoteId, notes[0].id);
});
test("Tab, Staff and Combined apply per instrument without changing musical data", () => {
  const score = setup();
  for (const view of ["tab", "staff", "combined"]) {
    const native = applyNotationView(toNativeScore(score), view),
      guitar = native.tracks[0].staves[0],
      piano = native.tracks[1].staves[0];
    assert.equal(guitar.showTablature, view !== "staff");
    assert.equal(guitar.showStandardNotation, view !== "tab");
    assert.equal(piano.showStandardNotation, true);
    assert.equal(piano.showTablature, false);
    assert.equal(guitar.bars[0].voices[0].beats[0].notes[0].realValue, 64);
  }
  assert.equal(score.tracks[0].tuning[0], 64);
});
test("keyboard range navigation extends selection without editing music", () => {
  const score = setup(),
    s = useEditorStore.getState();
  s.selectLocation(location(score));
  s.moveSelection(1, true);
  assert.equal(useEditorStore.getState().selectedNoteIds.length, 3);
  assert.equal(useEditorStore.getState().history.length, 1);
});
test("note hit testing chooses the nearest chord note even with overlapping touch targets", () => {
  const base = {
    kind: "note",
    width: 10,
    height: 8,
    noteIds: [],
    rest: false,
    location: {},
    label: "",
  };
  const targets = [
    { ...base, key: "a", x: 20, y: 20 },
    { ...base, key: "b", x: 20, y: 30 },
  ];
  assert.equal(nearestScoreNote(targets, 25, 33, 24).key, "b");
  assert.equal(nearestScoreNote(targets, 25, 23, 24).key, "a");
  assert.equal(nearestScoreNote(targets, 100, 100), undefined);
});
test("rendered targets carry exact model identities and offsets in every view", () => {
  const score = setup(),
    native = toNativeScore(score),
    b = native.tracks[0].staves[0].bars[0].voices[0].beats[0];
  const api = {
    score: native,
    boundsLookup: {
      findBeats: (beat) =>
        beat === b
          ? [
              {
                visualBounds: { x: 10, y: 20, w: 40, h: 70 },
                notes: [
                  {
                    note: b.notes[0],
                    noteHeadBounds: { x: 20, y: 30, w: 10, h: 8 },
                  },
                ],
              },
            ]
          : null,
    },
  };
  const targets = scoreTargets(api, score, { x: 5, y: 6 }),
    note = targets.find((t) => t.kind === "note");
  assert.equal(note.location.noteId, location(score).noteId);
  assert.equal(note.x, 25);
  assert.equal(note.y, 36);
  assert.match(note.label, /E4, string 1, fret 0/);
});

const { applySelectionPatch } = require("../src/utils/scoreSelection.ts");
const { applyNotationCommand } = require("../src/utils/notationCommands.ts");
function techniqueFixture() {
  return structuredClone(setup());
}
function commandOn(score, id) {
  const b = score.tracks[0].measures[0].voices[0].beats[0];
  applyNotationCommand(score, [b.notes[0].id], [b.id], id);
  return toNativeScore(score).tracks[0].staves[0].bars[0].voices[0].beats[0];
}
test("palette note techniques survive native conversion and toggle off", () => {
  const cases = [
    ["sharp", "accidentalMode", 3],
    ["tenuto", "accentuated", 3],
    ["marcato", "accentuated", 2],
    ["ghost", "isGhost", true],
    ["dead", "isDead", true],
    ["vibrato", "vibrato", 1],
    ["wide-vibrato", "vibrato", 2],
    ["natural-harmonic", "harmonicType", 1],
    ["pinch-harmonic", "harmonicType", 3],
    ["slide-in-low", "slideInType", 1],
    ["slide-out-up", "slideOutType", 3],
    ["finger-2", "leftHandFinger", 2],
    ["right-m", "rightHandFinger", 2],
    ["turn", "ornament", 2],
  ];
  for (const [id, field, value] of cases) {
    const score = techniqueFixture();
    assert.equal(commandOn(score, id).notes[0][field], value, `${id} applies`);
    const off = commandOn(score, id).notes[0];
    assert.notEqual(off[field], value, `${id} toggles off`);
  }
});
test("beat techniques, rests, extra dots and custom tuplets survive conversion", () => {
  const cases = [
    ["pick-up", "pickStroke", 1],
    ["pick-down", "pickStroke", 2],
    ["arpeggio-up", "brushType", 3],
    ["grace-before", "graceType", 2],
    ["tap", "tap", true],
    ["tremolo-16", "tremoloSpeed", 16],
  ];
  for (const [id, field, value] of cases) {
    assert.equal(commandOn(techniqueFixture(), id)[field], value, id);
  }
  const score = techniqueFixture(),
    b = score.tracks[0].measures[0].voices[0].beats[0];
  applySelectionPatch(score, [b.notes[0].id], [b.id], {
    dots: 2,
    tupletRatio: [5, 4],
  });
  let native =
    toNativeScore(score).tracks[0].staves[0].bars[0].voices[0].beats[0];
  assert.equal(native.dots, 2);
  assert.equal(native.tupletNumerator, 5);
  assert.equal(native.tupletDenominator, 4);
  native = commandOn(score, "rest-h");
  assert.equal(native.isRest, true);
  assert.equal(native.duration, 2);
});
test("slur, hammer and slide commands establish reciprocal note links and toggle off", () => {
  for (const id of ["slur", "hammer", "slide"]) {
    const score = techniqueFixture(),
      b = score.tracks[0].measures[0].voices[0].beats[0],
      next = score.tracks[0].measures[0].voices[0].beats[1],
      pairs = {
        slur: ["slurDestination", "slurOrigin"],
        hammer: ["hammerPullDestination", "hammerPullOrigin"],
        slide: ["slideTarget", "slideOrigin"],
      };
    commandOn(score, id);
    let native =
        toNativeScore(score).tracks[0].staves[0].bars[0].voices[0].beats,
      [dest, origin] = pairs[id];
    assert.equal(native[0].notes[0][dest], native[1].notes[0], id);
    assert.equal(native[1].notes[0][origin], native[0].notes[0], id);
    assert.equal(
      b.notes[0].links[
        Object.keys(b.notes[0].links).find(
          (k) => k.includes("destination") || k.includes("target"),
        )
      ],
      next.notes[0].id,
    );
    commandOn(score, id);
    native = toNativeScore(score).tracks[0].staves[0].bars[0].voices[0].beats;
    assert.ok(!native[0].notes[0][dest], `${id} removes`);
  }
});
test("repeat and ending edits made from another instrument update global master bars", () => {
  const score = techniqueFixture(),
    b = score.tracks[1].measures[0].voices[0].beats[0];
  for (const id of ["repeat-start", "repeat-end", "ending-1"])
    applyNotationCommand(score, [], [b.id], id);
  const native = toNativeScore(score);
  assert.equal(native.masterBars[0].isRepeatStart, true);
  assert.equal(native.masterBars[0].repeatCount, 2);
  assert.equal(native.masterBars[0].alternateEndings, 1);
});

test("technique edits are one undoable operation and invalid links roll back", () => {
  const score = setup(),
    s = useEditorStore.getState(),
    b = score.tracks[0].measures[0].voices[0].beats[0];
  s.selectLocation(location(score));
  s.editScore((draft) =>
    applyNotationCommand(draft, [b.notes[0].id], [b.id], "bend-full"),
  );
  assert.equal(useEditorStore.getState().history.length, 2);
  assert.equal(
    toNativeScore(
      useEditorStore.getState().score,
    ).tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0].bendPoints.at(-1)
      .value,
    4,
  );
  s.undo();
  assert.ok(
    !useEditorStore.getState().score.tracks[0].measures[0].voices[0].beats[0]
      .notes[0].source?.bendtype,
  );
  s.redo();
  assert.equal(useEditorStore.getState().historyIndex, 1);
});
test("every palette command survives renderer reconstruction", () => {
  const { notationCommands } = require("../src/utils/notationCommands.ts");
  for (const command of notationCommands) {
    const score = techniqueFixture();
    assert.doesNotThrow(() => commandOn(score, command.id), command.id);
  }
});
test("invalid relationship edits leave score and history unchanged", () => {
  const score = setup(),
    s = useEditorStore.getState(),
    last = score.tracks[0].measures[1].voices[0].beats[3];
  s.selectLocation({
    ...location(score),
    measureIndex: 1,
    beatId: last.id,
    noteId: null,
  });
  const before = useEditorStore.getState().score;
  assert.throws(
    () =>
      s.editScore((draft) =>
        applyNotationCommand(draft, [], [last.id], "slur"),
      ),
    /Select a note/,
  );
  assert.equal(useEditorStore.getState().score, before);
  assert.equal(useEditorStore.getState().history.length, 1);
});
test("tremolo toggles off rather than leaving an empty picking effect", () => {
  const score = techniqueFixture();
  assert.equal(commandOn(score, "tremolo-16").tremoloSpeed, 16);
  assert.equal(commandOn(score, "tremolo-16").tremoloSpeed, null);
});
test("default trill speed does not mark an unornamented imported note as a trill", () => {
  const {
    commandActive,
    notationCommands,
  } = require("../src/utils/notationCommands.ts");
  const score = techniqueFixture(),
    b = score.tracks[0].measures[0].voices[0].beats[0],
    n = b.notes[0];
  n.source = { trillspeed: 32, trillvalue: -1 };
  const command = notationCommands.find((c) => c.id === "trill");
  assert.equal(commandActive(command, [n], [b]), false);
  assert.equal(commandOn(score, "trill").notes[0].trillValue, n.pitch + 2);
  assert.equal(commandActive(command, [n], [b]), true);
  commandOn(score, "trill");
  assert.equal(commandActive(command, [n], [b]), false);
});
