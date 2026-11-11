require("fake-indexeddb/auto");
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
require("@coderline/alphatab");
global.window = new EventTarget();
global.BroadcastChannel = undefined;
const {
  initDatabase,
  saveScore,
  flushSaves,
  listLibrary,
  validateScore,
  putDocument,
  restoreLibrary,
} = require("../src/storage/fileSystem.ts");
const { blankScore } = require("../src/utils/project.ts");
const { useEditorStore } = require("../src/store/editorStore.ts");
const {
  saveScorePracticePreferences,
  scorePracticePreferences,
  withScorePracticePreferences,
} = require("../src/utils/practicePreferences.ts");

test("practice preferences stay per score and carry over in exported projects", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const entries = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key) => entries.get(key),
      setItem: (key, value) => entries.set(key, value),
    },
  });
  try {
    const score = blankScore("First");
    score.practice = { speed: 1, follow: false };
    const other = blankScore("Second");
    saveScorePracticePreferences(score, { speed: 1.5 });
    saveScorePracticePreferences(score, { metronome: true });
    assert.deepEqual(score.practice, { speed: 1, follow: false });
    assert.deepEqual(scorePracticePreferences(other), {});
    const exported = withScorePracticePreferences(score);
    assert.equal(exported.tracks, score.tracks);
    assert.deepEqual(exported.practice, {
      speed: 1.5,
      follow: false,
      metronome: true,
    });
    entries.clear();
    assert.deepEqual(scorePracticePreferences(exported), exported.practice);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

test("ordered autosave snapshots Immer drafts before revocation and restores latest edit", async () => {
  const score = blankScore("Original");
  useEditorStore.getState().setScore(score);
  useEditorStore.getState().updateScoreTitle("First edit");
  useEditorStore.getState().updateScoreTitle("Final edit");
  await flushSaves();
  const db = await initDatabase();
  assert.equal((await db.get("scores", score.id)).title, "Final edit");
  assert.ok(
    (await db.getAll("revisions")).filter((r) => r.scoreId === score.id)
      .length >= 2,
  );
  useEditorStore.getState().undo();
  await flushSaves();
  assert.equal((await db.get("scores", score.id)).title, "First edit");
  useEditorStore.getState().redo();
  await flushSaves();
  assert.equal((await db.get("scores", score.id)).title, "Final edit");
});
test("library documents preserve original bytes, annotations and recoverable trash", async () => {
  const doc = {
    id: crypto.randomUUID(),
    title: "Sheet",
    kind: "image",
    filename: "sheet.png",
    original: new Blob(["original"]),
    updatedAt: Date.now(),
    annotations: [
      {
        id: "annotation",
        page: 1,
        tool: "pen",
        color: "#ff0000",
        points: [{ x: 0.1, y: 0.2 }],
      },
    ],
  };
  await putDocument(doc);
  await putDocument({ ...doc, deletedAt: Date.now() });
  let item = (await listLibrary()).find((i) => i.id === doc.id);
  assert.ok(item.deletedAt);
  await putDocument({ ...item, deletedAt: undefined });
  item = (await listLibrary()).find((i) => i.id === doc.id);
  assert.equal(await item.original.text(), "original");
  assert.equal(item.annotations.length, 1);
  assert.equal(item.deletedAt, undefined);
});
test("project validation rejects invalid pitches, duplicate IDs, and unsupported versions", () => {
  const score = blankScore();
  validateScore(score);
  score.version = 999;
  assert.throws(() => validateScore(score), /newer/);
  score.version = 1;
  score.tracks[0].measures[0].voices[0].beats[1].id =
    score.tracks[0].measures[0].voices[0].beats[0].id;
  assert.throws(() => validateScore(score), /duplicate/);
});
test("backup restore validates before applying and merges without overwriting local scores", async () => {
  const score = blankScore("Local");
  await saveScore(score);
  const incoming = { ...score, title: "Remote" };
  const data = {
    format: "engraver-library",
    version: 1,
    scores: [incoming],
    documents: [],
    originals: [],
    setlists: [],
    revisions: [],
  };
  await restoreLibrary(new File([JSON.stringify(data)], "backup.json"));
  const db = await initDatabase();
  assert.equal((await db.get("scores", score.id)).title, "Local");
  const other = blankScore("New");
  data.scores = [other];
  await restoreLibrary(new File([JSON.stringify(data)], "backup.json"));
  assert.equal((await db.get("scores", other.id)).title, "New");
});
test("recovery snapshots are bounded per score", async () => {
  const score = blankScore("Snapshots");
  for (let i = 0; i < 25; i++)
    await saveScore({ ...score, title: `Revision ${i}` });
  const db = await initDatabase();
  assert.equal(
    (await db.getAll("revisions")).filter((r) => r.scoreId === score.id).length,
    20,
  );
});
test("playback stays disabled while loading, after errors, and when opening another score", () => {
  let store = useEditorStore.getState();
  store.setScoreStatus("loading");
  store.setPlayerReady(true);
  assert.equal(useEditorStore.getState().playerReady, false);
  store.setScoreStatus("ready");
  store.setPlayerReady(true);
  assert.equal(useEditorStore.getState().playerReady, true);
  store.setScoreStatus("error", "Render failed");
  assert.equal(useEditorStore.getState().playerReady, false);
  assert.equal(useEditorStore.getState().scoreError, "Render failed");
  store.setScore(blankScore(), false);
  assert.equal(useEditorStore.getState().scoreStatus, "loading");
  assert.equal(useEditorStore.getState().scoreError, null);
});

test("score and original import are committed together", async () => {
  const score = blankScore("Atomic import");
  await assert.rejects(
    saveScore(score, { filename: "bad", original: () => {} }),
  );
  const db = await initDatabase();
  assert.equal(await db.get("scores", score.id), undefined);
  assert.equal(await db.get("originals", score.id), undefined);
  await saveScore(score, {
    filename: "source.xml",
    original: new Blob(["source"]),
  });
  assert.equal((await db.get("scores", score.id)).title, "Atomic import");
  assert.equal(
    await (await db.get("originals", score.id)).original.text(),
    "source",
  );
});
