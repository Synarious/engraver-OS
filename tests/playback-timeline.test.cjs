const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
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
const {
  formatPlaybackTime,
  activePlaybackBlock,
  playbackSegments,
} = require("../src/utils/playbackTimeline.ts");
test("playback time is formatted and remaining time clamps to zero", () => {
  assert.equal(formatPlaybackTime(65000), "1:05");
  assert.equal(formatPlaybackTime(-1), "0:00");
  assert.equal(formatPlaybackTime(NaN), "0:00");
});
test("measure gaps follow playback duration through tempo changes and repeats", () => {
  const blocks = [
    { start: 0, end: 960, tempoChanges: [{ tick: 0, tempo: 120 }] },
    {
      start: 960,
      end: 1920,
      tempoChanges: [
        { tick: 960, tempo: 60 },
        { tick: 1440, tempo: 120 },
      ],
    },
    { start: 1920, end: 2880, tempoChanges: [{ tick: 1920, tempo: 120 }] },
  ];
  assert.deepEqual(playbackSegments(blocks), [8, 12, 8]);
  assert.equal(activePlaybackBlock(blocks, 2000), 2);
  assert.equal(activePlaybackBlock(blocks, 2880), 2);
  assert.deepEqual(playbackSegments(blocks, 2), [20, 8]);
});
