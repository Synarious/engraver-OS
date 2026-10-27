import { ScoreAST, BeatAST } from "../types/score";
import { collectNotes, resolveNoteLinks } from "./noteLinks";
export function blankScore(
  title = "Untitled",
  type: "guitar" | "bass" | "piano" | "percussion" = "guitar",
  count = 4,
): ScoreAST {
  const tuning =
    type === "guitar"
      ? [64, 59, 55, 50, 45, 40]
      : type === "bass"
        ? [43, 38, 33, 28]
        : undefined;
  return {
    id: crypto.randomUUID(),
    version: 1,
    title,
    tempo: 120,
    timeSignature: [4, 4],
    tracks: [
      {
        id: crypto.randomUUID(),
        name: type[0].toUpperCase() + type.slice(1),
        type,
        midiProgram: type === "guitar" ? 24 : type === "bass" ? 33 : 0,
        isMuted: false,
        isSolo: false,
        volume: 0.8,
        pan: 0,
        tuning,
        measures: Array.from({ length: count }, (_, index) => ({
          index,
          voices: [
            { index: 0, beats: Array.from({ length: 4 }, () => rest()) },
          ],
        })),
      },
    ],
  };
}
export function rest(): BeatAST {
  return {
    id: crypto.randomUUID(),
    duration: "q",
    isDotted: false,
    isTuplet: false,
    notes: [],
  };
}
export function freshIds<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value));
  const notes = collectNotes(clone),
    links = resolveNoteLinks(notes),
    ids = new Map<string, string>(),
    oldIds = new Map(notes.map((n) => [n, n.id]));
  const walk = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    if ("id" in obj && typeof obj.id === "string") {
      const id = crypto.randomUUID();
      ids.set(obj.id, id);
      obj.id = id;
    }
    for (const [key, v] of Object.entries(obj))
      if (key !== "source" && key !== "masterSource") walk(v);
  };
  walk(clone);
  for (const note of notes) {
    const oldId = oldIds.get(note);
    note.links = {};
    for (const [key, target] of Object.entries(links.get(oldId ?? "") ?? {})) {
      const mapped = ids.get(target);
      if (mapped)
        note.links[key as import("../types/score").NoteLinkKey] = mapped;
    }
    if (
      (links.get(oldId ?? "")?.tieoriginnoteid ||
        note.source?.tieoriginnoteid !== undefined) &&
      !note.links.tieoriginnoteid
    )
      note.isTied = false;
  }
  return clone;
}

export function setBeatDuration(beat: BeatAST, duration: BeatAST["duration"]) {
  beat.duration = duration;
  beat.isEmpty = false;
  delete beat.sourceDuration;
  if (beat.source) delete beat.source.duration;
}

export function voiceOptions(
  measures: import("../types/score").MeasureAST[],
  active = 0,
) {
  const count = measures.reduce(
    (max, m) =>
      Math.max(max, m.voices.length, ...m.voices.map((v) => v.index + 1)),
    Math.max(4, active + 1),
  );
  return Array.from({ length: count }, (_, index) => index);
}
/** Choose a playable string when transposition crosses the current string's range. */
export function transposeNote(
  note: import("../types/score").NoteAST,
  semitones: number,
  tuning?: number[],
) {
  const pitch = note.pitch + semitones;
  if (pitch < 0 || pitch > 127 || !Number.isInteger(pitch))
    throw new Error("Transposition exceeds the MIDI pitch range.");
  if (note.string === undefined || !tuning) return { ...note, pitch };
  const candidates = tuning
    .map((open, string) => ({ string, fret: pitch - open }))
    .filter((c) => c.fret >= 0 && c.fret <= 36);
  const position =
    candidates.find((c) => c.string === note.string) ??
    candidates.sort((a, b) => a.fret - b.fret)[0];
  if (!position)
    throw new Error(
      "Transposition exceeds the instrument tuning and fret range.",
    );
  return { ...note, pitch, ...position };
}
