const fs = require("node:fs");
const path = require("node:path");
const assets = path.resolve(__dirname, "../.open-next/assets");
// The runtime loads the two prepared chunks; do not upload the oversized source.
fs.rmSync(path.join(assets, "soundfont/generaluser.sf2"), { force: true });
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (fs.statSync(file).size > 25 * 1024 * 1024)
      throw new Error(`Cloudflare asset exceeds 25 MiB: ${file}`);
  }
}
check(assets);
