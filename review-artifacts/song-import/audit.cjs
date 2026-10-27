const fs = require("fs"),
  ts = require("typescript"),
  a = require("@coderline/alphatab");
require.extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
    f,
  );
const {
  parseGuitarPro,
  toNativeScore,
} = require("../../src/utils/alphaTabParser.ts");
const { validateScore } = require("../../src/storage/fileSystem.ts");
const bytes = fs.readFileSync(__dirname + "/Dichterliebe01.musicxml"),
  buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
const native = a.importer.ScoreLoader.loadScoreFromBytes(bytes),
  ast = parseGuitarPro(buffer);
validateScore(ast);
let rendered, renderError, captured;
const convert = a.model.JsonConverter.jsObjectToScore;
a.model.JsonConverter.jsObjectToScore = (raw) => {
  captured = JSON.parse(JSON.stringify(raw));
  return convert.call(a.model.JsonConverter, raw);
};
try {
  rendered = toNativeScore(ast);
} catch (error) {
  renderError = String(error);
} finally {
  a.model.JsonConverter.jsObjectToScore = convert;
}
fs.writeFileSync(
  __dirname + "/reconstructed-source.json",
  JSON.stringify(captured, null, 2),
);
fs.writeFileSync(
  __dirname + "/imported-project.json",
  JSON.stringify(ast, null, 2),
);
if (!rendered) {
  console.log("PRODUCTION CONVERSION ERROR:", renderError);
  /* Diagnostic only: restore original source IDs to compare the remaining conversion. */ for (
    let ti = 0;
    ti < captured.tracks.length;
    ti++
  )
    for (let si = 0; si < captured.tracks[ti].staves.length; si++)
      for (let mi = 0; mi < captured.tracks[ti].staves[si].bars.length; mi++)
        for (
          let vi = 0;
          vi < captured.tracks[ti].staves[si].bars[mi].voices.length;
          vi++
        ) {
          const voice = captured.tracks[ti].staves[si].bars[mi].voices[vi],
            original = JSON.parse(a.model.JsonConverter.scoreToJson(native))
              .tracks[ti].staves[si].bars[mi].voices[vi];
          voice.beats.forEach((b, bi) => {
            b.id = original?.beats[bi]?.id;
            b.notes.forEach((n, ni) => {
              n.id = original?.beats[bi]?.notes[ni]?.id;
            });
          });
        }
  rendered = convert.call(a.model.JsonConverter, captured);
}
function summary(s) {
  return {
    title: s.title,
    subtitle: s.subTitle,
    artist: s.artist,
    tempo: s.tempo,
    masterBars: s.masterBars.length,
    tracks: s.tracks.map((t) => ({
      name: t.name,
      program: t.playbackInfo.program,
      staves: t.staves.map((st) => ({
        bars: st.bars.length,
        voices: [...new Set(st.bars.map((b) => b.voices.length))],
        beats: st.bars.flatMap((b) => b.voices.flatMap((v) => v.beats)).length,
        notes: st.bars.flatMap((b) =>
          b.voices.flatMap((v) => v.beats.flatMap((b) => b.notes)),
        ).length,
      })),
    })),
  };
}
const changes = {};
const examples = {};
const keys = [
  "isEmpty",
  "isRest",
  "duration",
  "dots",
  "tupletNumerator",
  "tupletDenominator",
  "dynamics",
  "text",
  "lyrics",
  "graceType",
  "playbackDuration",
  "playbackStart",
  "displayDuration",
  "displayStart",
];
function record(key, before, after, location) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    changes[key] = (changes[key] ?? 0) + 1;
    examples[key] ??= [];
    if (examples[key].length < 6)
      examples[key].push({ location, before, after });
  }
}
for (let ti = 0; ti < native.tracks.length; ti++)
  for (let si = 0; si < native.tracks[ti].staves.length; si++) {
    const l = native.tracks[ti].staves[si],
      r = rendered.tracks[ti].staves[si];
    for (let mi = 0; mi < l.bars.length; mi++)
      for (let vi = 0; vi < l.bars[mi].voices.length; vi++)
        for (let bi = 0; bi < l.bars[mi].voices[vi].beats.length; bi++) {
          const b = l.bars[mi].voices[vi].beats[bi],
            x = r.bars[mi].voices[vi].beats[bi],
            loc = `track ${ti + 1} staff ${si + 1} measure ${mi + 1} voice ${vi + 1} beat ${bi + 1}`;
          if (!x) {
            record("missingBeat", true, false, loc);
            continue;
          }
          for (const key of keys) record("beat." + key, b[key], x[key], loc);
          for (let ni = 0; ni < b.notes.length; ni++) {
            const n = b.notes[ni],
              y = x.notes[ni];
            for (const key of [
              "realValue",
              "isTieDestination",
              "isSlurDestination",
              "dynamics",
              "accidentalMode",
              "isVisible",
              "accentuated",
              "percussionArticulation",
            ])
              record("note." + key, n[key], y?.[key], loc + ` note ${ni + 1}`);
          }
        }
  }
for (let i = 0; i < native.masterBars.length; i++)
  for (const key of [
    "isAnacrusis",
    "timeSignatureNumerator",
    "timeSignatureDenominator",
    "start",
    "alternateEndings",
    "repeatCount",
    "isRepeatStart",
  ])
    record(
      "master." + key,
      native.masterBars[i][key],
      rendered.masterBars[i][key],
      `measure ${i + 1}`,
    );
const result = {
  renderError,
  diagnosticOnly: !!renderError,
  source: summary(native),
  converted: summary(rendered),
  changes,
  examples,
};
fs.writeFileSync(
  __dirname + "/model-audit.json",
  JSON.stringify(result, null, 2),
);
fs.writeFileSync(
  __dirname + "/imported-project.json",
  JSON.stringify(ast, null, 2),
);
console.log(JSON.stringify(result, null, 2));
const originalRaw = JSON.parse(a.model.JsonConverter.scoreToJson(native));
const empties = JSON.parse(JSON.stringify(captured));
for (let ti = 0; ti < empties.tracks.length; ti++)
  for (let si = 0; si < empties.tracks[ti].staves.length; si++)
    for (let mi = 0; mi < empties.tracks[ti].staves[si].bars.length; mi++)
      for (
        let vi = 0;
        vi < empties.tracks[ti].staves[si].bars[mi].voices.length;
        vi++
      ) {
        const original = originalRaw.tracks[ti].staves[si].bars[mi].voices[vi];
        empties.tracks[ti].staves[si].bars[mi].voices[vi].beats.forEach(
          (beat, bi) => {
            beat.isempty = original?.beats[bi]?.isempty ?? true;
          },
        );
      }
const preserved = convert.call(a.model.JsonConverter, empties);
const timing = {
  sourceMeasure2Start: native.masterBars[1].start,
  convertedMeasure2Start: rendered.masterBars[1].start,
  afterPreservingEmptyFlags: preserved.masterBars[1].start,
};
fs.writeFileSync(
  __dirname + "/timing-diagnostic.json",
  JSON.stringify(timing, null, 2),
);
console.log("Empty-flag timing diagnostic:", timing);
