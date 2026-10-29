import type { ScoreAST, BeatAST, NoteAST, TrackAST } from "../types/score";
import { toNativeScore } from "./alphaTabParser";
import { lyricXML } from "./musicxmlDetails";
import { first, elements, parseXML, serializeXML } from "./musicxmlDocument";
import { keySignature, spellPitch } from "./musicxmlPitch";

export const escapeXML = (v: unknown) =>
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
const num = (v: number) => String(Math.round(v * 1e9) / 1e9);
const durationNames: Record<number, string> = {
  [-4]: "long",
  [-2]: "breve",
  1: "whole",
  2: "half",
  4: "quarter",
  8: "eighth",
  16: "16th",
  32: "32nd",
  64: "64th",
  128: "128th",
  256: "256th",
};
const durations = { w: 1, h: 2, q: 4, e: 8, s: 16, t: 32, x: 64, y: 128 };
const stavesOf = (t: TrackAST) => [
  { source: t.source?.staves?.[0], measures: t.measures },
  ...(t.additionalStaves ?? []),
];
const nonempty = (b: BeatAST) =>
  !(b.isEmpty ?? b.source?.isempty) || b.notes.length > 0;
const ticks = (b: BeatAST) =>
  b.source?.overridedisplayduration > 0
    ? b.source!.overridedisplayduration
    : (b.sourceDuration && b.sourceDuration < 0
        ? 3840 * -b.sourceDuration
        : 3840 / (b.sourceDuration ?? durations[b.duration])) *
      (b.isDotted ? 2 - 1 / 2 ** Math.max(1, b.source?.dots ?? 1) : 1) *
      (b.isTuplet ? (b.tuplet?.[1] ?? 2) / (b.tuplet?.[0] ?? 3) : 1);
const grace = (b: BeatAST) => !!b.source?.gracetype;
const dir = (body: string, staff = 1, voice?: number, offset = 0, sound = "") =>
  `<direction><direction-type>${body}</direction-type>${offset ? `<offset>${num(offset)}</offset>` : ""}${voice ? `<voice>${voice}</voice>` : ""}<staff>${staff}</staff>${sound}</direction>`;
const endingNumbers = (bits: number) =>
  Array.from({ length: 8 }, (_, i) => (bits & (1 << i) ? i + 1 : 0))
    .filter(Boolean)
    .join(",");

function defaultsXML(score: ScoreAST) {
  const doc = parseXML(score.source?.musicxml?.defaults || "<defaults/>"),
    root = doc.documentElement!;
  for (const [group, tag, value] of [
    ["system-layout", "system-distance", score.engraving?.systemGap],
    ["staff-layout", "staff-distance", score.engraving?.staffGap],
  ] as const)
    if (
      value !== undefined &&
      (score.source?.musicxml?.importedEngraving?.[
        group === "system-layout" ? "systemGap" : "staffGap"
      ] !== value ||
        !first(root, group))
    ) {
      let parent = first(root, group);
      if (!parent) {
        parent = doc.createElement(group);
        root.appendChild(parent);
      }
      let e = first(parent, tag);
      if (!e) {
        e = doc.createElement(tag);
        parent.appendChild(e);
      }
      e.textContent = num(value);
    }
  if (
    score.engraving?.lyricFontSize !== undefined &&
    (score.source?.musicxml?.importedEngraving?.lyricFontSize !==
      score.engraving.lyricFontSize ||
      !first(root, "lyric-font"))
  ) {
    let e = first(root, "lyric-font");
    if (!e) {
      e = doc.createElement("lyric-font");
      root.appendChild(e);
    }
    e.setAttribute("font-size", num(score.engraving.lyricFontSize * 0.75));
  }
  const order = [
    "scaling",
    "concert-score",
    "page-layout",
    "system-layout",
    "staff-layout",
    "appearance",
    "music-font",
    "word-font",
    "lyric-font",
    "lyric-language",
  ];
  for (const e of elements(root).sort(
    (a, b) => order.indexOf(a.localName) - order.indexOf(b.localName),
  ))
    root.appendChild(e);
  return elements(root).length ? serializeXML(root) : "";
}

function harmonyXML(b: BeatAST, staff: number) {
  if (!b.chord) return "";
  if (
    b.source?.musicxml?.harmony &&
    JSON.stringify(b.source.musicxml.harmonyChord) === JSON.stringify(b.chord)
  ) {
    const doc = parseXML(b.source.musicxml.harmony),
      root = doc.documentElement!;
    let st = first(root, "staff");
    if (!st) {
      st = doc.createElement("staff");
      root.appendChild(st);
    }
    st.textContent = String(staff);
    return serializeXML(root);
  }
  const c = b.chord,
    match = c.name.match(
      /^([A-G])([#b♯♭]{0,2})(.*?)(?:\/([A-G])([#b♯♭]{0,2}))?$/,
    ),
    suffix = match?.[3] ?? "";
  const alter = (s = "") =>
    [...s].reduce((n, c) => n + (/[b♭]/.test(c) ? -1 : 1), 0);
  const kind =
    (
      {
        "": "major",
        m: "minor",
        min: "minor",
        maj7: "major-seventh",
        M7: "major-seventh",
        "7": "dominant",
        m7: "minor-seventh",
        dim: "diminished",
        aug: "augmented",
        sus2: "suspended-second",
        sus4: "suspended-fourth",
        "6": "major-sixth",
        m6: "minor-sixth",
        "9": "dominant-ninth",
        m9: "minor-ninth",
        maj9: "major-ninth",
        dim7: "diminished-seventh",
        m7b5: "half-diminished",
      } as Record<string, string>
    )[suffix] ?? "other";
  const frame = c.strings?.length
    ? `<frame><frame-strings>${c.strings.length}</frame-strings><frame-frets>${Math.max(4, ...c.strings.filter((f) => f > 0).map((f) => f - (c.firstFret ?? 1) + 1))}</frame-frets><first-fret>${Math.max(1, c.firstFret ?? 1)}</first-fret>${c.strings.map((f, i) => (f < 0 ? "" : `<frame-note><string>${i + 1}</string><fret>${f}</fret></frame-note>`)).join("")}</frame>`
    : "";
  return `<harmony print-frame="${frame ? "yes" : "no"}">${match ? `<root><root-step>${match[1]}</root-step>${alter(match[2]) ? `<root-alter>${alter(match[2])}</root-alter>` : ""}</root><kind text="${escapeXML(suffix)}">${kind}</kind>` : `<function>${escapeXML(c.name)}</function><kind>other</kind>`}${match?.[4] ? `<bass><bass-step>${match[4]}</bass-step>${alter(match[5]) ? `<bass-alter>${alter(match[5])}</bass-alter>` : ""}</bass>` : ""}${frame}<staff>${staff}</staff></harmony>`;
}

function noteNotations(
  n: NoteAST,
  nn: any,
  b: BeatAST,
  ni: number,
  relation: (n: any, kind: string) => string,
  tuplets: string,
) {
  let result =
    relation(nn, "tie") + relation(nn, "slur") + relation(nn, "slide");
  const a = n.articulations ?? {};
  const articulations = `${a.accent ? "<accent/>" : ""}${a.marcato ? '<strong-accent type="up"/>' : ""}${a.tenuto ? "<tenuto/>" : ""}${a.staccato ? "<staccato/>" : ""}`;
  let technical =
    n.string !== undefined
      ? `<string>${n.string + 1}</string><fret>${Math.max(0, n.fret ?? 0)}</fret>`
      : "";
  if (nn.harmonicType)
    technical += `<harmonic>${nn.harmonicType === 1 ? "<natural/>" : "<artificial/>"}</harmonic>${nn.harmonicType > 2 ? `<other-technical>${["", "", "", "pinch harmonic", "tap harmonic", "semi harmonic", "feedback harmonic"][nn.harmonicType]}</other-technical>` : ""}`;
  if (nn.leftHandFinger >= 0)
    technical += `<fingering>${nn.leftHandFinger === 0 ? "T" : nn.leftHandFinger}</fingering>`;
  if (nn.rightHandFinger >= 0)
    technical += `<pluck>${["p", "i", "m", "a", "c"][nn.rightHandFinger] ?? nn.rightHandFinger}</pluck>`;
  technical += relation(nn, "hammer");
  if (nn.hasBend) {
    let current = 0;
    for (let i = 0; i < nn.bendPoints.length; i++) {
      const value = nn.bendPoints[i].value / 2;
      if (value === current) continue;
      technical += `<bend><bend-alter>${num(Math.abs(value - current))}</bend-alter>${i === 0 && value > 0 ? "<pre-bend/>" : value < current ? "<release/>" : ""}</bend>`;
      current = value;
    }
  }
  if (a.palmMute) technical += "<other-technical>palm mute</other-technical>";
  if (a.letRing) technical += "<other-technical>let ring</other-technical>";
  if (ni === 0)
    technical += `${b.source?.tap ? "<tap/>" : ""}${b.source?.slap ? "<other-technical>slap</other-technical>" : ""}${b.source?.pop ? "<other-technical>pop</other-technical>" : ""}`;
  let ornaments = nn.isTrill ? "<trill-mark/>" : "";
  const ornament = (
    {
      1: "inverted-turn",
      2: "turn",
      3: "inverted-mordent",
      4: "mordent",
    } as Record<number, string>
  )[nn.ornament];
  if (ornament) ornaments += `<${ornament}/>`;
  if (nn.vibrato)
    ornaments += '<wavy-line type="start"/><wavy-line type="stop"/>';
  if (ni === 0 && b.source?.tremolopicking)
    ornaments += `<tremolo type="single">${b.source.tremolopicking.marks ?? 1}</tremolo>`;
  if (articulations)
    result += `<articulations>${articulations}</articulations>`;
  if (technical) result += `<technical>${technical}</technical>`;
  if (ornaments) result += `<ornaments>${ornaments}</ornaments>`;
  if (ni === 0 && nn.beat.fermata) result += "<fermata/>";
  if (ni === 0) result += tuplets;
  if (ni === 0 && b.source?.brushtype)
    result += `<arpeggiate direction="${[1, 3].includes(b.source.brushtype) ? "up" : "down"}"/>`;
  return result ? `<notations>${result}</notations>` : "";
}

function navigationXML(directions: number[] | undefined) {
  const labels = [
    "Fine",
    "Segno",
    "Segno segno",
    "Coda",
    "Double coda",
    "D.C.",
    "D.C. al Coda",
    "D.C. al Double Coda",
    "D.C. al Fine",
    "D.S.",
    "D.S. al Coda",
    "D.S. al Double Coda",
    "D.S. al Fine",
    "D.S.S.",
    "D.S.S. al Coda",
    "D.S.S. al Double Coda",
    "D.S.S. al Fine",
    "To Coda",
    "To Double Coda",
  ];
  return (directions ?? [])
    .map((d) => {
      const sound =
        d === 0
          ? 'fine="yes"'
          : d === 1
            ? 'segno="segno"'
            : d === 2
              ? 'segno="segno2"'
              : d === 3
                ? 'coda="coda"'
                : d === 4
                  ? 'coda="coda2"'
                  : d >= 5 && d <= 8
                    ? 'dacapo="yes"'
                    : d >= 9 && d <= 12
                      ? 'dalsegno="segno"'
                      : d >= 13 && d <= 16
                        ? 'dalsegno="segno2"'
                        : d === 17
                          ? 'tocoda="coda"'
                          : d === 18
                            ? 'tocoda="coda2"'
                            : "";
      return (
        dir(
          d === 1 || d === 2
            ? "<segno/>"
            : d === 3 || d === 4
              ? "<coda/>"
              : `<words>${labels[d] ?? ""}</words>`,
        ) + `<sound ${sound}/>`
      );
    })
    .join("");
}

export function exportMusicXML(score: ScoreAST) {
  const native = toNativeScore(score),
    channels = Array.from({ length: 15 }, (_, i) => (i < 9 ? i + 1 : i + 2));
  const infos = score.tracks.map((t, ti) => {
    const notes = new Map<number, string>();
    if (t.type === "percussion")
      for (const st of stavesOf(t))
        for (const m of st.measures)
          for (const v of m.voices)
            for (const b of v.beats)
              for (const n of b.notes)
                if (!notes.has(n.pitch))
                  notes.set(n.pitch, `I${ti + 1}D${n.pitch}`);
    return {
      channel:
        t.type === "percussion"
          ? 10
          : channels[
              score.tracks.slice(0, ti).filter((t) => t.type !== "percussion")
                .length % 15
            ],
      port:
        t.type === "percussion"
          ? 1
          : Math.floor(
              score.tracks.slice(0, ti).filter((t) => t.type !== "percussion")
                .length / 15,
            ) + 1,
      notes,
    };
  });
  const instruments = score.tracks
    .map((t, ti) => {
      const info = infos[ti],
        entries = info.notes.size
          ? [...info.notes].map(([pitch, id]) => ({
              id,
              pitch,
              name: `${t.name} ${pitch}`,
            }))
          : [{ id: `I${ti + 1}`, pitch: undefined, name: t.name }];
      return `<score-part id="P${ti + 1}"><part-name>${escapeXML(t.name)}</part-name>${entries.map((e) => `<score-instrument id="${e.id}"><instrument-name>${escapeXML(e.name)}</instrument-name></score-instrument>`).join("")}${entries.map((e) => `<midi-device id="${e.id}" port="${info.port}"/>`).join("")}${entries.map((e) => `<midi-instrument id="${e.id}"><midi-channel>${info.channel}</midi-channel><midi-program>${t.midiProgram + 1}</midi-program>${e.pitch !== undefined ? `<midi-unpitched>${e.pitch + 1}</midi-unpitched>` : ""}<volume>${num(t.volume * 100)}</volume><pan>${num(t.pan * 90)}</pan></midi-instrument>`).join("")}</score-part>`;
    })
    .join("");
  const parts = score.tracks
    .map((track, ti) => {
      const staves = stavesOf(track),
        nt = native.tracks[ti],
        info = infos[ti],
        voiceNumbers = new Map<string, number>();
      let voiceCount = 0;
      staves.forEach((st, si) => {
        const max = Math.max(1, ...st.measures.map((m) => m.voices.length));
        for (let vi = 0; vi < max; vi++)
          if (st.measures.some((m) => m.voices[vi]?.beats.some(nonempty)))
            voiceNumbers.set(`${si}:${vi}`, ++voiceCount);
      });
      const tupletSymbols = new Map<string, string>();
      const neighbors = new Map<
        string,
        { before?: BeatAST; after?: BeatAST }
      >();
      staves.forEach((st) => {
        const count = Math.max(1, ...st.measures.map((m) => m.voices.length));
        for (let vi = 0; vi < count; vi++) {
          const lane = st.measures.flatMap((m) => m.voices[vi]?.beats ?? []);
          let position = 0,
            previousKey = "";
          lane.forEach((beat, i) => {
            neighbors.set(beat.id, { before: lane[i - 1], after: lane[i + 1] });
            const key = beat.isTuplet
              ? JSON.stringify([beat.duration, beat.tuplet ?? [3, 2]])
              : "";
            position = key && key === previousKey ? position + 1 : 0;
            previousKey = key;
            const same =
              beat.source?.musicxml?.tupletSignature ===
              JSON.stringify([
                beat.duration,
                beat.isDotted,
                beat.isTuplet,
                beat.tuplet,
              ]);
            if (beat.isTuplet) {
              const count = beat.tuplet?.[0] ?? 3,
                next = lane[i + 1],
                nextKey = next?.isTuplet
                  ? JSON.stringify([next.duration, next.tuplet ?? [3, 2]])
                  : "";
              tupletSymbols.set(
                beat.id,
                same && beat.source?.musicxml?.tuplets !== undefined
                  ? beat.source.musicxml.tuplets
                  : `${position % count === 0 ? '<tuplet type="start" bracket="yes"/>' : ""}${position % count === count - 1 || nextKey !== key ? '<tuplet type="stop"/>' : ""}`,
              );
            }
          });
        }
      });
      const pools = new Map<string, Map<any, number>>();
      const pairNumber = (origin: any, kind: string) => {
        let pool = pools.get(kind);
        if (!pool) {
          pool = new Map();
          pools.set(kind, pool);
        }
        if (!pool.has(origin)) {
          const destination =
            kind === "slur"
              ? origin.slurDestination
              : kind === "hammer"
                ? origin.hammerPullDestination
                : origin.slideTarget;
          const start = origin.beat.absoluteDisplayStart,
            end = destination?.beat.absoluteDisplayStart ?? start;
          const occupied = new Set(
            [...pool]
              .filter(([other]) => {
                const target =
                  kind === "slur"
                    ? other.slurDestination
                    : kind === "hammer"
                      ? other.hammerPullDestination
                      : other.slideTarget;
                return (
                  other.beat.absoluteDisplayStart < end &&
                  (target?.beat.absoluteDisplayStart ?? 0) > start
                );
              })
              .map(([, number]) => number),
          );
          const free = Array.from({ length: 16 }, (_, i) => i + 1).find(
            (number) => !occupied.has(number),
          );
          if (!free)
            throw new Error(
              "This score has more than 16 overlapping notation connections. Save an Engraver project to preserve them.",
            );
          pool.set(origin, free);
        }
        return pool.get(origin)!;
      };
      const relations = (n: any, kind: string) => {
        if (kind === "tie")
          return `${n.isTieDestination ? '<tied type="stop"/>' : ""}${n.tieDestination ? '<tied type="start"/>' : ""}`;
        const origin =
            kind === "slur"
              ? n.slurOrigin
              : kind === "hammer"
                ? n.hammerPullOrigin
                : n.slideOrigin,
          destination =
            kind === "slur"
              ? n.slurDestination
              : kind === "hammer"
                ? n.hammerPullDestination
                : n.slideTarget,
          tag =
            kind === "slur" ? "slur" : kind === "slide" ? "slide" : "hammer-on";
        return `${origin ? `<${tag} type="stop" number="${pairNumber(origin, kind)}"/>` : ""}${destination ? `<${tag} type="start" number="${pairNumber(n, kind)}"/>` : ""}`;
      };
      const measures = track.measures
        .map((m, mi) => {
          const master = native.masterBars[mi],
            ts = m.timeSignature ?? score.timeSignature,
            counts: number[] = track.source?.systemslayout?.length
              ? track.source.systemslayout
              : (score.source?.systemslayout ?? []);
          let sum = 0;
          const starts = new Set(counts.map((c) => (sum += c))),
            newSystem =
              mi > 0 &&
              (counts.length
                ? starts.has(mi)
                : !!score.engraving?.barsPerRow &&
                  mi % score.engraving.barsPerRow === 0),
            saved = m.source?.musicxml;
          let output = newSystem ? '<print new-system="yes"/>' : "";
          if (saved?.print) {
            const print = parseXML(saved.print).documentElement!;
            if (counts.length || score.engraving?.barsPerRow)
              print.setAttribute(
                "new-system",
                newSystem || print.getAttribute("new-page") === "yes"
                  ? "yes"
                  : "no",
              );
            output = serializeXML(print);
          }
          const keys = staves
            .map((st, si) => {
              const bar = nt.staves[si].bars[mi],
                k = keySignature(
                  st.measures[mi]?.keySignature,
                  bar.keySignature,
                  bar.keySignatureType,
                );
              return `<key number="${si + 1}"><fifths>${k.fifths}</fifths><mode>${k.mode ? "minor" : "major"}</mode></key>`;
            })
            .join("");
          const clefs = staves
            .map((st, si) => {
              const bar = nt.staves[si].bars[mi],
                [sign, line] =
                  track.type === "percussion"
                    ? ["percussion", undefined]
                    : ((
                        {
                          0: ["percussion", undefined],
                          1: ["C", 3],
                          2: ["C", 4],
                          3: ["F", 4],
                          4: ["G", 2],
                        } as Record<number, any>
                      )[bar.clef] ?? ["G", 2]);
              return `<clef number="${si + 1}"><sign>${sign}</sign>${line ? `<line>${line}</line>` : ""}</clef>`;
            })
            .join("");
          const staffDetails =
            mi === 0
              ? staves
                  .map((st, si) => {
                    const staff = nt.staves[si],
                      tuning = staff.tuning;
                    return `<staff-details number="${si + 1}"><staff-lines>${staff.standardNotationLineCount || 5}</staff-lines>${tuning
                      .map((p: number, i: number) => {
                        const s = spellPitch(p, 0);
                        return `<staff-tuning line="${tuning.length - i}"><tuning-step>${s.step}</tuning-step>${s.alter ? `<tuning-alter>${s.alter}</tuning-alter>` : ""}<tuning-octave>${s.octave}</tuning-octave></staff-tuning>`;
                      })
                      .join(
                        "",
                      )}${staff.capo ? `<capo>${staff.capo}</capo>` : ""}</staff-details>`;
                  })
                  .join("")
              : "";
          const transposes = staves
            .map((st, si) => {
              const staff = nt.staves[si],
                shift =
                  staff.displayTranspositionPitch || -staff.transpositionPitch;
              return `<transpose number="${si + 1}"><chromatic>${shift % 12}</chromatic>${Math.trunc(shift / 12) ? `<octave-change>${Math.trunc(shift / 12)}</octave-change>` : ""}</transpose>`;
            })
            .join("");
          output += `<attributes><divisions>960</divisions>${keys}<time><beats>${ts[0]}</beats><beat-type>${ts[1]}</beat-type></time>${mi === 0 ? `<staves>${staves.length}</staves>` : ""}${clefs}${staffDetails}${transposes}</attributes>`;
          const tempo = master.tempoAutomations.length
            ? master.tempoAutomations
            : mi === 0
              ? [{ value: score.tempo, ratioPosition: 0 }]
              : [];
          for (const e of tempo)
            output += dir(
              `<metronome><beat-unit>quarter</beat-unit><per-minute>${num(e.value)}</per-minute></metronome>`,
              1,
              undefined,
              e.ratioPosition * master.calculateDuration(false),
              `<sound tempo="${num(e.value)}"/>`,
            );
          if (m.rehearsal)
            output += dir(`<rehearsal>${escapeXML(m.rehearsal)}</rehearsal>`);
          output += navigationXML(m.masterSource?.directions);
          if (master.tripletFeel) {
            const feel = master.tripletFeel,
              sixteenth = feel % 2 === 1;
            const ratio = feel <= 2 ? [2, 1] : feel <= 4 ? [3, 1] : [1, 3];
            output += `<sound><swing><first>${ratio[0]}</first><second>${ratio[1]}</second><swing-type>${sixteenth ? "16th" : "eighth"}</swing-type></swing></sound>`;
          }
          const ending = m.alternateEndings ?? 0,
            previousEnding = track.measures[mi - 1]?.alternateEndings ?? 0,
            nextEnding = track.measures[mi + 1]?.alternateEndings ?? 0;
          if (m.repeatStart || (ending !== previousEnding && ending))
            output += `<barline location="left">${ending !== previousEnding && ending ? `<ending number="${endingNumbers(ending)}" type="start"/>` : ""}${m.repeatStart ? '<repeat direction="forward"/>' : ""}</barline>`;
          let cursor = 0;
          staves.forEach((st, si) => {
            const model = st.measures[mi],
              bar = nt.staves[si].bars[mi],
              staff = nt.staves[si];
            if (!model) return;
            const key = keySignature(
              model.keySignature,
              bar.keySignature,
              bar.keySignatureType,
            );
            model.voices.forEach((v, vi) => {
              const voice = voiceNumbers.get(`${si}:${vi}`);
              if (!voice) return;
              if (cursor > 0)
                output += `<backup><duration>${num(cursor)}</duration></backup>`;
              cursor = 0;
              let previousDynamic: string | undefined;
              if (
                vi ===
                model.voices.findIndex((_, i) => voiceNumbers.has(`${si}:${i}`))
              )
                for (const pedal of bar.sustainPedals)
                  output += dir(
                    `<pedal type="${({ 0: "start", 1: "change", 2: "stop" } as Record<number, string>)[pedal.pedalType] ?? "start"}" line="yes"/>`,
                    si + 1,
                    voice,
                    pedal.ratioPosition * master.calculateDuration(false),
                  );
              v.beats.forEach((b, bi) => {
                const nb = bar.voices[vi]?.beats[bi];
                if (!nb) return;
                const d = grace(b) ? 0 : ticks(b);
                if (!nonempty(b)) {
                  if (d > 0) {
                    output += `<forward><duration>${num(d)}</duration><voice>${voice}</voice><staff>${si + 1}</staff></forward>`;
                    cursor += d;
                  }
                  return;
                }
                const { before, after } = neighbors.get(b.id) ?? {};
                const crescendo = b.source?.crescendo ?? 0;
                if (b.text)
                  output += dir(
                    `<words>${escapeXML(b.text)}</words>`,
                    si + 1,
                    voice,
                  );
                if (b.dynamics && b.dynamics !== previousDynamic) {
                  output += dir(
                    `<dynamics><${b.dynamics}/></dynamics>`,
                    si + 1,
                    voice,
                  );
                  previousDynamic = b.dynamics;
                }
                if (crescendo && before?.source?.crescendo !== crescendo)
                  output += dir(
                    `<wedge type="${crescendo === 1 ? "crescendo" : "diminuendo"}" number="1"/>`,
                    si + 1,
                    voice,
                  );
                if (b.pedalEvent)
                  output += dir(
                    `<pedal type="${({ down: "start", up: "stop", change: "change" } as const)[b.pedalEvent]}" line="yes"/>`,
                    si + 1,
                    voice,
                  );
                output += harmonyXML(b, si + 1);
                (b.notes.length ? b.notes : [null]).forEach((n, ni) => {
                  const nn = n ? nb.notes[ni] : null,
                    shift =
                      staff.displayTranspositionPitch ||
                      -staff.transpositionPitch,
                    p =
                      n && nn
                        ? spellPitch(
                            nn.realValue - shift,
                            key.fifths,
                            n.source?.accidentalmode ?? 0,
                            n.spelling,
                            n.pitch,
                          )
                        : null,
                    attrs = n?.source?.musicxml?.attributes ?? {};
                  const attack =
                    n && nn
                      ? n.velocity !== undefined &&
                        (n.velocityOverride || !b.dynamics)
                        ? n.velocity
                        : [15, 31, 47, 63, 79, 95, 111, 127][nn.dynamics]
                      : undefined;
                  output += `<note${Object.entries(attrs)
                    .map(([k, v]) => ` ${k}="${escapeXML(v)}"`)
                    .join(
                      "",
                    )}${attack !== undefined ? ` dynamics="${num((attack * 100) / 90)}"` : ""}>`;
                  if (grace(b))
                    output +=
                      b.source?.musicxml?.grace || '<grace slash="yes"/>';
                  else if (b.source?.musicxml?.cue) output += "<cue/>";
                  if (ni) output += "<chord/>";
                  if (!n) output += "<rest/>";
                  else if (track.type === "percussion")
                    output +=
                      n.source?.musicxml?.unpitched ??
                      "<unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched>";
                  else
                    output += `<pitch><step>${escapeXML(p!.step)}</step>${p!.alter ? `<alter>${num(p!.alter)}</alter>` : ""}<octave>${p!.octave}</octave></pitch>`;
                  if (!grace(b)) output += `<duration>${num(d)}</duration>`;
                  if (n && nn && !b.source?.musicxml?.cue)
                    output += `${nn.isTieDestination ? '<tie type="stop"/>' : ""}${nn.tieDestination ? '<tie type="start"/>' : ""}`;
                  if (n && track.type === "percussion")
                    output += `<instrument id="${info.notes.get(n.pitch)}"/>`;
                  output += `<voice>${voice}</voice><type>${durationNames[b.sourceDuration ?? durations[b.duration]] ?? "quarter"}</type>${"<dot/>".repeat(b.isDotted ? Math.max(1, b.source?.dots ?? 1) : 0)}`;
                  if (n && n.source?.accidentalmode !== 1) {
                    if (
                      n.source?.musicxml?.accidental &&
                      n.spelling?.pitch === n.pitch &&
                      p?.step === n.spelling.step &&
                      p?.alter === n.spelling.alter
                    )
                      output += n.source.musicxml.accidental;
                    else if (p?.alter || n.source?.accidentalmode === 2)
                      output += `<accidental>${({ [-2]: "flat-flat", [-1]: "flat", 0: "natural", 1: "sharp", 2: "double-sharp" } as Record<number, string>)[p?.alter ?? 0] ?? "other"}</accidental>`;
                  }
                  if (b.isTuplet)
                    output +=
                      b.source?.musicxml?.timeModification &&
                      b.source.musicxml.tupletSignature ===
                        JSON.stringify([
                          b.duration,
                          b.isDotted,
                          b.isTuplet,
                          b.tuplet,
                        ])
                        ? b.source.musicxml.timeModification
                        : `<time-modification><actual-notes>${b.tuplet?.[0] ?? 3}</actual-notes><normal-notes>${b.tuplet?.[1] ?? 2}</normal-notes></time-modification>`;
                  const stem =
                    b.stemDirection ??
                    (b.source?.preferredbeamdirection === 0
                      ? "up"
                      : b.source?.preferredbeamdirection === 1
                        ? "down"
                        : undefined);
                  if (stem) output += `<stem>${stem}</stem>`;
                  if (n?.source?.musicxml?.notehead)
                    output += n.source.musicxml.notehead;
                  output += `<staff>${si + 1}</staff>`;
                  if (n && nn)
                    output += noteNotations(
                      n,
                      nn,
                      b,
                      ni,
                      relations,
                      tupletSymbols.get(b.id) ?? "",
                    );
                  else if (!n && tupletSymbols.get(b.id))
                    output += `<notations>${tupletSymbols.get(b.id)}</notations>`;
                  if (ni === 0) output += lyricXML(b, escapeXML);
                  output += "</note>";
                });
                cursor += d;
                if (crescendo && after?.source?.crescendo !== crescendo)
                  output += dir(
                    '<wedge type="stop" number="1"/>',
                    si + 1,
                    voice,
                  );
              });
            });
          });
          if (m.repeatCount || (ending && ending !== nextEnding))
            output += `<barline location="right">${ending && ending !== nextEnding ? `<ending number="${endingNumbers(ending)}" type="${m.repeatCount ? "stop" : "discontinue"}"/>` : ""}${m.repeatCount ? `<repeat direction="backward" times="${m.repeatCount}"/>` : ""}</barline>`;
          return `<measure number="${mi + 1}"${saved?.implicit ? ` implicit="${escapeXML(saved.implicit)}"` : master.isAnacrusis ? ' implicit="yes"' : ""}${saved?.width ? ` width="${num(saved.width)}"` : ""}>${output}</measure>`;
        })
        .join("");
      return `<part id="P${ti + 1}">${measures}</part>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>${escapeXML(score.title)}</work-title></work><identification><creator type="composer">${escapeXML(score.artist)}</creator>${score.source?.words ? `<creator type="lyricist">${escapeXML(score.source.words)}</creator>` : ""}${score.source?.copyright ? `<rights>${escapeXML(score.source.copyright)}</rights>` : ""}</identification>${defaultsXML(score)}${score.engraving?.titleFontSize ? `<credit page="1"><credit-type>title</credit-type><credit-words font-size="${num(score.engraving.titleFontSize * 0.75)}">${escapeXML(score.title)}</credit-words></credit>` : ""}${score.subTitle ? `<credit page="1"><credit-type>subtitle</credit-type><credit-words>${escapeXML(score.subTitle)}</credit-words></credit>` : ""}${score.source?.musicxml?.credits?.join("") ?? ""}<part-list>${instruments}</part-list>${parts}</score-partwise>`;
}
