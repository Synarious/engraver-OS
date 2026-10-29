const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const bundled = path.join(
  require("node:os").homedir(),
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe",
);
const python =
  process.env.MUSICXML_PYTHON || (fs.existsSync(bundled) ? bundled : "python");
if (
  spawnSync(python, ["-c", "import lxml"], { stdio: "ignore" }).status !== 0
) {
  console.error(
    "MusicXML schema checks require Python with lxml. Install lxml or set MUSICXML_PYTHON to a Python executable with lxml.",
  );
  process.exit(1);
}
const result = spawnSync(
  process.execPath,
  ["--test", "tests/musicxml-interop.test.cjs"],
  { stdio: "inherit", env: { ...process.env, MUSICXML_PYTHON: python } },
);
process.exit(result.status ?? 1);
