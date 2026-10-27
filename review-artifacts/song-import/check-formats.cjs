const fs = require("fs"),
  ts = require("typescript"),
  a = require("@coderline/alphatab");
require.extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    f,
  );
const {
  parseGuitarPro,
  toNativeScore,
} = require("../../src/utils/alphaTabParser.ts");
for (const filename of [
  "Dichterliebe01.musicxml",
  "Dichterliebe01.mxl",
  "Saltarello.musicxml",
  "Echigo-Jishi.musicxml",
]) {
  try {
    const b = fs.readFileSync(__dirname + "/" + filename),
      native = a.importer.ScoreLoader.loadScoreFromBytes(b),
      ast = parseGuitarPro(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      );
    console.log(
      filename,
      "source",
      native.title,
      native.masterBars.length,
      "bars",
    );
    try {
      toNativeScore(ast);
      console.log(" RECONSTRUCT OK");
    } catch (e) {
      console.log(" RECONSTRUCT FAILED:", e.message);
    }
  } catch (e) {
    console.log(filename, e.message);
  }
}
