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
