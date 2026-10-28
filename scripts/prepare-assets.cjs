const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, ".."),
  pdf = path.dirname(require.resolve("pdfjs-dist/package.json"));
fs.mkdirSync(path.join(root, "public/pdfjs"), { recursive: true });
for (const folder of ["cmaps", "standard_fonts", "wasm"])
  fs.cpSync(path.join(pdf, folder), path.join(root, "public/pdfjs", folder), {
    recursive: true,
  });
fs.copyFileSync(
  path.join(pdf, "build/pdf.worker.min.mjs"),
  path.join(root, "public/pdf.worker.min.mjs"),
);

// Workers static assets have a 25 MiB per-file limit. Keep the bank intact
// in source and serve smaller byte-exact chunks on every hosting platform.
const bank = fs.readFileSync(
  path.join(root, "public/soundfont/generaluser.sf2"),
);
const chunkSize = 16 * 1024 * 1024;
for (let i = 0; i < 2; i++)
  fs.writeFileSync(
    path.join(root, `public/soundfont/generaluser.sf2.part${i + 1}`),
    bank.subarray(i * chunkSize, (i + 1) * chunkSize),
  );
if (bank.length > chunkSize * 2)
  throw new Error("Sound bank exceeds the configured two-part size");
