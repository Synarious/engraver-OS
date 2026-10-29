import * as a from "@coderline/alphatab";
import { importMusicXMLDetails } from "./musicxmlDetails";
import { prepareMusicXML, parseXML, elements } from "./musicxmlDocument";
import { keySignature } from "./musicxmlPitch";
import { ScoreAST, TrackAST, MeasureAST, BeatAST } from "../types/score";
import {
  collectNotes,
  resolveNoteLinks,
  remapRendererNotes,
} from "./noteLinks";
const durations = [1, 2, 4, 8, 16, 32, 64, 128];
const names: BeatAST["duration"][] = ["w", "h", "q", "e", "s", "t", "x", "y"];
const dynamics = ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"] as const;
const copy = (v: unknown) => JSON.parse(JSON.stringify(v));
export function parseGuitarPro(buffer: ArrayBuffer): ScoreAST {
  const normalized = prepareMusicXML(new Uint8Array(buffer));
  const bytes = normalized
    ? new TextEncoder().encode(normalized)
    : new Uint8Array(buffer);
  const native = a.importer.ScoreLoader.loadScoreFromBytes(bytes);
  if (normalized) {
    const doc = parseXML(normalized);
    elements(doc.documentElement, "part").forEach((part, ti) => {
      for (const measure of elements(part, "measure"))
        for (const attributes of elements(measure, "attributes"))
          for (const details of elements(attributes, "staff-details")) {
            const lines = details.getAttribute("data-engraver-staff-lines");
            const si = Number(details.getAttribute("number") || 1) - 1;
            if (lines && native.tracks[ti]?.staves[si])
              native.tracks[ti].staves[si].standardNotationLineCount =
                Number(lines);
          }
    });
  }
  const raw = JSON.parse(a.model.JsonConverter.scoreToJson(native));
  const measures = (staff: any, rs: any): MeasureAST[] =>
    staff.bars.map((bar: any, i: number) => {
      const master = native.masterBars[i];
      return {
        index: i,
        source: rs.bars[i],
        masterSource: raw.masterbars[i],
        clef: ({ 1: "alto", 2: "tenor", 3: "bass", 4: "treble" } as const)[
          bar.clef as 1 | 2 | 3 | 4
        ],
        timeSignature: [
          master.timeSignatureNumerator,
          master.timeSignatureDenominator,
        ],
        tempo: master.tempoAutomations[0]?.value,
        repeatStart: master.isRepeatStart,
        repeatCount: master.repeatCount,
        alternateEndings: master.alternateEndings,
        rehearsal: master.section?.text,
        voices: bar.voices.map((v: any, vi: number) => ({
          index: vi,
          source: rs.bars[i].voices[vi],
          beats: v.beats.map((b: any, bi: number) => ({
            id: crypto.randomUUID(),
            source: rs.bars[i].voices[vi].beats[bi],
            isEmpty: b.isEmpty,
            sourceDuration: durations.includes(b.duration)
              ? undefined
              : b.duration,
            duration: names[durations.indexOf(b.duration)] ?? "q",
            isDotted: b.dots > 0,
            isTuplet: b.hasTuplet,
            tuplet: b.hasTuplet
              ? [b.tupletNumerator, b.tupletDenominator]
              : undefined,
            dynamics: dynamics[b.dynamics],
            lyrics: b.lyrics ?? undefined,
            text: b.text ?? undefined,
            stemDirection:
              b.preferredBeamDirection === 0
                ? "up"
                : b.preferredBeamDirection === 1
                  ? "down"
                  : undefined,
            chord: b.chord
              ? {
                  name: b.chord.name,
                  strings: [...b.chord.strings],
                  firstFret: b.chord.firstFret,
                }
              : undefined,
            notes: b.notes.map((n: any, ni: number) => ({
              id: crypto.randomUUID(),
              source: rs.bars[i].voices[vi].beats[bi].notes[ni],
              pitch: n.isPercussion
                ? (staff.track.percussionArticulations[n.percussionArticulation]
                    ?.outputMidiNumber ?? n.realValue)
                : n.isStringed
                  ? n.fret + (staff.tuning[staff.tuning.length - n.string] ?? 0)
                  : n.octave * 12 + n.tone,
              fret: n.isStringed ? (n.isDead ? -1 : n.fret) : undefined,
              string: n.isStringed ? staff.tuning.length - n.string : undefined,
              isTied: n.isTieDestination,
              articulations: {
                accent: n.accentuated === 1,
                marcato: n.accentuated === 2,
                tenuto: n.accentuated === 3,
                palmMute: n.isPalmMute,
                letRing: n.isLetRing,
                staccato: n.isStaccato,
                slide: n.slideOutType ? "legato" : undefined,
              },
            })),
          })),
        })),
      };
    });
  const result: ScoreAST = {
    id: crypto.randomUUID(),
    version: 1,
    source: raw,
    title: native.title || "Untitled",
    subTitle: native.subTitle,
    artist: native.artist,
    album: native.album,
    tempo: native.tempo,
    timeSignature: native.masterBars[0]
      ? [
          native.masterBars[0].timeSignatureNumerator,
          native.masterBars[0].timeSignatureDenominator,
        ]
      : [4, 4],
    tracks: native.tracks.map((t, ti): TrackAST => ({
      id: crypto.randomUUID(),
      source: raw.tracks[ti],
      name: t.name,
      type: t.staves[0]?.isPercussion
        ? "percussion"
        : t.staves[0]?.isStringed
          ? t.playbackInfo.program >= 32 && t.playbackInfo.program <= 39
            ? "bass"
            : "guitar"
          : "piano",
      midiProgram: t.playbackInfo.program,
      isMuted: t.playbackInfo.isMute,
      isSolo: t.playbackInfo.isSolo,
      volume: t.playbackInfo.volume / 16,
      pan: (t.playbackInfo.balance - 8) / 8,
      tuning: t.staves[0]?.isStringed ? [...t.staves[0].tuning] : undefined,
      measures: t.staves[0]
        ? measures(t.staves[0], raw.tracks[ti].staves[0])
        : [],
      additionalStaves: t.staves.slice(1).map((s, si) => ({
        source: raw.tracks[ti].staves[si + 1],
        measures: measures(s, raw.tracks[ti].staves[si + 1]),
      })),
    })),
  };
  const notes = collectNotes(result),
    links = resolveNoteLinks(notes);
  for (const note of notes) note.links = links.get(note.id);
  if (normalized) importMusicXMLDetails(bytes, result, native);
  return result;
}
export function toNativeScore(score: ScoreAST) {
  const noteEntries: { model: import("../types/score").NoteAST; raw: any }[] =
    [];
  const raw: any = copy(score.source ?? {});
  Object.assign(raw, {
    title: score.title,
    subtitle: score.subTitle ?? "",
    artist: score.artist ?? "",
    album: score.album ?? "",
  });
  const count = Math.max(1, ...score.tracks.map((t) => t.measures.length));
  raw.masterbars = Array.from({ length: count }, (_, i) => {
    const m = score.tracks[0]?.measures[i],
      master: any = copy(m?.masterSource ?? {}),
      ts = m?.timeSignature ?? score.timeSignature;
    Object.assign(master, {
      timesignaturenumerator: ts[0],
      timesignaturedenominator: ts[1],
      isrepeatstart: m?.repeatStart ?? false,
      repeatcount: m?.repeatCount ?? 0,
      alternateendings: m?.alternateEndings ?? 0,
    });
    if (m?.rehearsal) master.section = { text: m.rehearsal, marker: "" };
    else delete master.section;
    if (i === 0 || m?.tempo) {
      master.tempoautomations ??= [];
      master.tempoautomations[0] = {
        ...master.tempoautomations[0],
        type: 0,
        value: m?.tempo ?? score.tempo,
        ratioposition: master.tempoautomations[0]?.ratioposition ?? 0,
      };
    }
    return master;
  });
  raw.tracks = score.tracks.map((t, ti) => {
    const r: any = copy(t.source ?? {});
    r.name = t.name;
    r.playbackinfo = {
      ...r.playbackinfo,
      program: t.midiProgram,
      volume: Math.round(t.volume * 16),
      balance: Math.round(t.pan * 8 + 8),
      ismute: t.isMuted,
      issolo: t.isSolo,
      primarychannel:
        t.type === "percussion"
          ? 9
          : (r.playbackinfo?.primarychannel ??
            (ti % 15 < 9 ? ti % 15 : (ti % 15) + 1)),
      secondarychannel:
        t.type === "percussion"
          ? 9
          : (r.playbackinfo?.secondarychannel ??
            (ti % 15 < 9 ? ti % 15 : (ti % 15) + 1)),
    };
    r.staves = [
      { source: r.staves?.[0], measures: t.measures },
      ...(t.additionalStaves ?? []),
    ].map((data, si) => {
      const s: any = copy(data.source ?? {}),
        tuning = si === 0 ? t.tuning : s.stringtuning?.tunings;
      s.stringtuning = { ...s.stringtuning, tunings: tuning ?? [] };
      s.showstandardnotation = true;
      s.showtablature = !!tuning?.length;
      s.ispercussion = t.type === "percussion";
      s.bars = Array.from({ length: count }, (_, mi) => {
        const m = data.measures[mi],
          bar: any = copy(m?.source ?? {});
        if (m?.clef)
          bar.clef = { treble: 4, bass: 3, alto: 1, tenor: 2, tab: 4 }[m.clef];
        if (m?.keySignature) {
          const key = keySignature(
            m.keySignature,
            bar.keysignature,
            bar.keysignaturetype,
          );
          bar.keysignature = key.fifths;
          bar.keysignaturetype = key.mode;
        }
        bar.voices = (m?.voices ?? [{ index: 0, beats: [] }]).map((v) => ({
          ...copy(v.source ?? {}),
          beats: v.beats.length
            ? v.beats.map((b) => {
                const beat: any = copy(b.source ?? {});
                Object.assign(beat, {
                  isempty: b.notes.length
                    ? false
                    : (b.isEmpty ?? beat.isempty ?? false),
                  duration:
                    b.sourceDuration ??
                    (!durations.includes(beat.duration) &&
                    typeof beat.duration === "number" &&
                    b.duration === "q"
                      ? beat.duration
                      : durations[names.indexOf(b.duration)]),
                  dots: b.isDotted ? Math.max(1, beat.dots ?? 1) : 0,
                  tupletnumerator: b.isTuplet ? (b.tuplet?.[0] ?? 3) : -1,
                  tupletdenominator: b.isTuplet ? (b.tuplet?.[1] ?? 2) : -1,
                  lyrics: b.lyrics ?? null,
                  text: b.text ?? null,
                  preferredbeamdirection:
                    b.stemDirection === "up"
                      ? 0
                      : b.stemDirection === "down"
                        ? 1
                        : null,
                });
                if (b.dynamics) beat.dynamics = dynamics.indexOf(b.dynamics);
                if (b.chord) {
                  s.chords = {
                    ...s.chords,
                    [b.id]: {
                      name: b.chord.name,
                      strings: b.chord.strings ?? [],
                      firstfret: b.chord.firstFret ?? 1,
                      showname: true,
                      showdiagram: !!b.chord.strings?.length,
                    },
                  };
                  beat.chordid = b.id;
                } else beat.chordid = null;
                beat.notes = b.notes.map((n) => {
                  const note: any = copy(n.source ?? {});
                  note.istiedestination = n.isTied;
                  if (b.dynamics) note.dynamics = dynamics.indexOf(b.dynamics);
                  if (n.string !== undefined && tuning?.length)
                    Object.assign(note, {
                      string: tuning.length - n.string,
                      fret: Math.max(0, n.fret ?? 0),
                      octave: -1,
                      tone: -1,
                    });
                  else
                    Object.assign(note, {
                      string: -1,
                      fret: -1,
                      octave: Math.floor(n.pitch / 12),
                      tone: n.pitch % 12,
                    });
                  if (t.type === "percussion")
                    note.percussionarticulation = n.pitch;
                  Object.assign(note, {
                    isdead: n.fret === -1 || !!note.isdead,
                    accentuated: n.articulations?.marcato
                      ? 2
                      : n.articulations?.tenuto
                        ? 3
                        : n.articulations?.accent
                          ? 1
                          : 0,
                    ispalmmute: !!n.articulations?.palmMute,
                    isletring: !!n.articulations?.letRing,
                    isstaccato: !!n.articulations?.staccato,
                    slideouttype: n.articulations?.slide
                      ? note.slideouttype || 2
                      : 0,
                  });
                  noteEntries.push({ model: n, raw: note });
                  return note;
                });
                return beat;
              })
            : [{ duration: 1, notes: [], isempty: true }],
        }));
        return bar;
      });
      return s;
    });
    return r;
  });
  for (const t of raw.tracks)
    for (const staff of t.staves) {
      const voices = Math.max(
        1,
        ...staff.bars.map((b: any) => b.voices.length),
      );
      for (const bar of staff.bars)
        while (bar.voices.length < voices)
          bar.voices.push({
            beats: [{ duration: 1, notes: [], isempty: true }],
          });
    }
  // Imported numeric IDs are renderer internals. Regenerate after copy/paste to avoid collisions.
  const stripIds = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.id === "number") delete value.id;
    for (const child of Object.values(value)) stripIds(child);
  };
  stripIds(raw);
  remapRendererNotes(noteEntries);
  const native = a.model.JsonConverter.jsObjectToScore(raw);
  // Cross-staff connections can point backwards in serialized traversal while
  // moving forwards in musical time. alphaTab cannot resolve these until every
  // staff has finished, so reconnect them through stable application identities.
  const nativeNotes = new Map<number, a.model.Note>();
  for (const track of native.tracks)
    for (const staff of track.staves)
      for (const bar of staff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats)
            for (const note of beat.notes) nativeNotes.set(note.id, note);
  const entriesById = new Map(noteEntries.map((e) => [e.model.id, e]));
  const links = resolveNoteLinks(noteEntries.map((e) => e.model));
  for (const destination of noteEntries) {
    for (const [key, originId] of Object.entries(
      links.get(destination.model.id) ?? {},
    )) {
      if (!key.includes("origin")) continue;
      const origin = entriesById.get(originId);
      if (
        !origin ||
        origin.raw.id < destination.raw.id ||
        origin === destination
      )
        continue;
      const from = nativeNotes.get(origin.raw.id),
        to = nativeNotes.get(destination.raw.id);
      if (!from || !to) continue;
      if (
        key === "sluroriginnoteid" &&
        destination.model.source?.isslurdestination !== false
      ) {
        from.slurDestination = to;
        to.slurOrigin = from;
        to.isSlurDestination = true;
      }
      if (key === "tieoriginnoteid" && destination.model.isTied) {
        from.tieDestination = to;
        to.tieOrigin = from;
        to.isTieDestination = true;
      }
      if (
        key === "hammerpulloriginnoteid" &&
        origin.model.source?.ishammerpullorigin !== false
      ) {
        from.hammerPullDestination = to;
        to.hammerPullOrigin = from;
        from.isHammerPullOrigin = true;
      }
      if (key === "slideoriginnoteid" && origin.model.articulations?.slide) {
        from.slideTarget = to;
        to.slideOrigin = from;
        from.slideOutType = origin.raw.slideouttype || 2;
      }
    }
  }
  // Finishing an alphaTab score copies beat dynamics over every note. Restore
  // imported per-note expression afterward so simultaneous notes can differ.
  native.tracks.forEach((track, ti) => {
    const source = score.tracks[ti];
    const staves = [
      source.measures,
      ...(source.additionalStaves ?? []).map((s) => s.measures),
    ];
    track.staves.forEach((staff, si) =>
      staff.bars.forEach((bar, mi) =>
        bar.voices.forEach((voice, vi) =>
          voice.beats.forEach((beat, bi) => {
            const original = staves[si]?.[mi]?.voices[vi]?.beats[bi];
            if (!original) return;
            beat.notes.forEach((note, ni) => {
              const velocity = original.notes[ni]?.velocity;
              if (original.dynamics && !original.notes[ni]?.velocityOverride)
                return;
              if (velocity !== undefined && Number.isFinite(velocity))
                note.dynamics = Math.max(
                  0,
                  Math.min(7, Math.round((velocity - 15) / 16)),
                );
            });
          }),
        ),
      ),
    );
  });
  return native;
}
