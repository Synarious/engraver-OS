const { spawnSync } = require("node:child_process");

const result = spawnSync(
  process.execPath,
  [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
