import { ScoreAST, TrackAST, MeasureAST, BeatAST } from "../types/score";
const xml = (v: unknown) =>
  String(v ?? "").replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const lengths = {
  w: 3840,
  h: 1920,
  q: 960,
  e: 480,
  s: 240,
  t: 120,
  x: 60,
  y: 30,
};
const types = {
  w: "whole",
  h: "half",
  q: "quarter",
  e: "eighth",
  s: "16th",
  t: "32nd",
  x: "64th",
  y: "128th",
};
export function exportMusicXML(score: ScoreAST) {
  const staves = (t: TrackAST) => [
    { measures: t.measures },
    ...(t.additionalStaves ?? []),
  ];
  const dots = (b: BeatAST) =>
    b.isDotted ? Math.max(1, Math.min(3, Number(b.source?.dots) || 1)) : 0;
  const duration = (b: BeatAST) =>
    Math.round(
      lengths[b.duration] *
        (2 - 1 / 2 ** dots(b)) *
        (b.isTuplet ? (b.tuplet?.[1] ?? 2) / (b.tuplet?.[0] ?? 3) : 1),
    );
  const parts = score.tracks
    .map(
      (t, ti) =>
        `<part id="P${ti + 1}">${t.measures
          .map((m, mi) => {
            const ts = m.timeSignature ?? score.timeSignature;
            let content = `<attributes><divisions>960</divisions>${mi === 0 ? `<staves>${staves(t).length}</staves>` : ""}<time><beats>${ts[0]}</beats><beat-type>${ts[1]}</beat-type></time><key><fifths>${m.source?.keysignature ?? 0}</fifths></key>${staves(
              t,
            )
              .map((st, si) => {
                const clef = st.measures[mi]?.clef ?? (si ? "bass" : "treble");
                return `<clef number="${si + 1}"><sign>${clef === "bass" ? "F" : clef === "alto" ? "C" : "G"}</sign><line>${clef === "bass" ? 4 : clef === "alto" ? 3 : 2}</line></clef>`;
              })
              .join("")}</attributes>`;
            if (mi === 0 || m.tempo)
              content += `<direction><sound tempo="${m.tempo ?? score.tempo}"/></direction>`;
            if (m.rehearsal)
              content += `<direction><direction-type><rehearsal>${xml(m.rehearsal)}</rehearsal></direction-type></direction>`;
            if (m.repeatStart)
              content +=
                '<barline location="left"><repeat direction="forward"/></barline>';
            const voiceStride = Math.max(
              1,
              ...staves(t).flatMap((st) =>
                st.measures.map((measure) => measure.voices.length),
              ),
            );
            let previousDuration = 0;
            staves(t).forEach((st, si) => {
              const measure: MeasureAST | undefined = st.measures[mi];
              measure?.voices.forEach((v, vi) => {
                if (previousDuration)
                  content += `<backup><duration>${previousDuration}</duration></backup>`;
                previousDuration = 0;
                for (const b of v.beats) {
                  const d = duration(b);
                  previousDuration += d;
                  if (b.text)
                    content += `<direction><direction-type><words>${xml(b.text)}</words></direction-type></direction>`;
                  if (b.dynamics)
                    content += `<direction><direction-type><dynamics><${b.dynamics}/></dynamics></direction-type></direction>`;
                  content += (b.notes.length ? b.notes : [null])
                    .map((n, ni) => {
                      const pitch = n?.pitch ?? 60,
                        pc = pitch % 12,
                        step = [
                          "C",
                          "C",
                          "D",
                          "D",
                          "E",
                          "F",
                          "F",
                          "G",
                          "G",
                          "A",
                          "A",
                          "B",
                        ][pc],
                        alter = [1, 3, 6, 8, 10].includes(pc)
                          ? "<alter>1</alter>"
                          : "";
                      const nextBeat =
                        v.beats[v.beats.indexOf(b) + 1] ??
                        st.measures[mi + 1]?.voices[vi]?.beats[0];
                      const next =
                        n &&
                        nextBeat?.notes.find(
                          (next) =>
                            next.pitch === pitch &&
                            next.isTied &&
                            (n.string === undefined ||
                              next.string === n.string),
                        );
                      return `<note>${ni ? "<chord/>" : ""}${n ? `<pitch><step>${step}</step>${alter}<octave>${Math.floor(pitch / 12) - 1}</octave></pitch>` : "<rest/>"}<duration>${d}</duration>${n?.isTied ? '<tie type="stop"/>' : ""}${next ? '<tie type="start"/>' : ""}<voice>${si * voiceStride + vi + 1}</voice><type>${types[b.duration]}</type>${"<dot/>".repeat(dots(b))}${b.isTuplet ? `<time-modification><actual-notes>${b.tuplet?.[0] ?? 3}</actual-notes><normal-notes>${b.tuplet?.[1] ?? 2}</normal-notes></time-modification>` : ""}<staff>${si + 1}</staff>${n ? `<notations>${n.isTied ? '<tied type="stop"/>' : ""}${next ? '<tied type="start"/>' : ""}${n.articulations?.accent || n.articulations?.staccato ? `<articulations>${n.articulations.accent ? "<accent/>" : ""}${n.articulations.staccato ? "<staccato/>" : ""}</articulations>` : ""}${n.string !== undefined ? `<technical><string>${n.string + 1}</string><fret>${Math.max(0, n.fret ?? 0)}</fret></technical>` : ""}</notations>` : ""}${ni === 0 ? (b.lyrics?.map((text, i) => `<lyric number="${i + 1}"><text>${xml(text)}</text></lyric>`).join("") ?? "") : ""}</note>`;
                    })
                    .join("");
                }
              });
            });
            if (m.repeatCount)
              content += `<barline location="right">${m.alternateEndings ? `<ending number="${m.alternateEndings === 1 ? 1 : 2}" type="stop"/>` : ""}<repeat direction="backward" times="${m.repeatCount}"/></barline>`;
            return `<measure number="${mi + 1}">${content}</measure>`;
          })
          .join("")}</part>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise version="4.0"><work><work-title>${xml(score.title)}</work-title></work><identification><creator type="composer">${xml(score.artist)}</creator>${score.source?.words ? `<creator type="lyricist">${xml(score.source.words)}</creator>` : ""}${score.source?.copyright ? `<rights>${xml(score.source.copyright)}</rights>` : ""}</identification>${score.subTitle ? `<credit page="1"><credit-type>subtitle</credit-type><credit-words>${xml(score.subTitle)}</credit-words></credit>` : ""}<part-list>${score.tracks.map((t, i) => `<score-part id="P${i + 1}"><part-name>${xml(t.name)}</part-name><score-instrument id="I${i + 1}"><instrument-name>${xml(t.name)}</instrument-name></score-instrument><midi-instrument id="I${i + 1}"><midi-channel>${t.type === "percussion" ? 10 : (i % 9) + 1}</midi-channel><midi-program>${t.midiProgram + 1}</midi-program></midi-instrument></score-part>`).join("")}</part-list>${parts}</score-partwise>`;
}
