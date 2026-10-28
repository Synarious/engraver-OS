const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { buildAssetManifest } = require("miniflare");

test("Cloudflare excludes the oversized source bank and includes both exact playback chunks", async () => {
  const root = path.resolve(__dirname, "../public");
  const { assetsReverseMap } = await buildAssetManifest(root);
  const files = Object.values(assetsReverseMap).map((asset) =>
    asset.filePath.replaceAll("\\", "/"),
  );
  assert.ok(!files.includes("soundfont/generaluser.sf2"));
  for (const number of [1, 2])
    assert.ok(files.includes(`soundfont/generaluser.sf2.part${number}`));
  for (const file of files)
    assert.ok(
      fs.statSync(path.join(root, file)).size <= 25 * 1024 * 1024,
      file,
    );
  const original = fs.readFileSync(
    path.join(root, "soundfont/generaluser.sf2"),
  );
  const combined = Buffer.concat(
    [1, 2].map((number) =>
      fs.readFileSync(
        path.join(root, `soundfont/generaluser.sf2.part${number}`),
      ),
    ),
  );
  assert.deepEqual(combined, original);
});
