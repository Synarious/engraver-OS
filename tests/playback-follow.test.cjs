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
const { centeredPlaybackPosition } = require("../src/utils/playbackFollow.ts");
test("follow centers the beat and staff system relative to the actual scroll viewport", () => {
  assert.deepEqual(
    centeredPlaybackPosition({
      scrollLeft: 80,
      scrollTop: 300,
      originLeft: -40,
      originTop: -100,
      viewLeft: 20,
      viewTop: 50,
      beatX: 600,
      systemY: 800,
      systemHeight: 100,
      width: 400,
      height: 500,
    }),
    { left: 420, top: 750 },
  );
});

test("follow camera eases into line changes and converges without overshooting", () => {
  const { advancePlaybackScroll } = require("../src/utils/playbackFollow.ts");
  let position = 0,
    velocity = 0;
  const first = advancePlaybackScroll(position, velocity, 300, 16);
  assert.ok(first.position > 0 && first.position < 3);
  for (let frame = 0; frame < 160; frame++) {
    const next = advancePlaybackScroll(position, velocity, 300, 16);
    assert.ok(next.position >= position && next.position <= 300);
    position = next.position;
    velocity = next.velocity;
  }
  assert.ok(300 - position < 0.01);
  const reverse = advancePlaybackScroll(position, velocity, 0, 16);
  assert.ok(position - reverse.position < 3);
});

test("seeking behind a moving playhead reverses immediately without overshoot", () => {
  const { advancePlaybackScroll } = require("../src/utils/playbackFollow.ts");
  const forward = advancePlaybackScroll(100, 0, 600, 16);
  const back = advancePlaybackScroll(forward.position, forward.velocity, 20, 16);
  assert.ok(back.position < forward.position && back.position >= 20);
  assert.ok(back.velocity < 0);
  assert.deepEqual(advancePlaybackScroll(100, 600, 101, 16), {
    position: 101,
    velocity: 0,
  });
});
