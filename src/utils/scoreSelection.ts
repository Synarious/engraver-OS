import {
  BeatAST,
  MeasureAST,
  NoteAST,
  ScoreAST,
  TrackAST,
} from "../types/score";
import { setBeatDuration, transposeNote } from "./project";
export interface ScoreLocation {
  trackId: string;
  staffIndex: number;
  measureIndex: number;
  voiceIndex: number;
  beatId: string;
  noteId?: string | null;
}
export type SelectionMode = "replace" | "toggle" | "range";
export interface SelectionPatch {
  duration?: BeatAST["duration"];
  dotted?: boolean;
  dots?: number;
  tupletRatio?: [number, number];
  tuplet?: boolean;
  dynamics?: BeatAST["dynamics"];
  pitch?: number;
  semitones?: number;
  fret?: number;
  string?: number;
  tied?: boolean;
  accent?: boolean;
  palmMute?: boolean;
  letRing?: boolean;
  staccato?: boolean;
}
export function staffMeasures(
  track: TrackAST,
  staffIndex: number,
): MeasureAST[] {
  return staffIndex
    ? (track.additionalStaves?.[staffIndex - 1]?.measures ?? [])
    : track.measures;
}
export function staffTuning(
  track: TrackAST,
  staffIndex: number,
): number[] | undefined {
  return staffIndex
    ? track.additionalStaves?.[staffIndex - 1]?.source?.stringtuning?.tunings
    : track.tuning;
}
export function locateBeat(
  score: ScoreAST | null,
  location: ScoreLocation | null,
) {
  if (!score || !location) return null;
  const track = score.tracks.find((t) => t.id === location.trackId),
    measure = track
      ? staffMeasures(track, location.staffIndex)[location.measureIndex]
      : undefined,
    voice = measure?.voices[location.voiceIndex],
    beat = voice?.beats.find((b) => b.id === location.beatId);
  if (!track || !measure || !voice || !beat) return null;
  return {
    track,
    measure,
    voice,
    beat,
    note: beat.notes.find((n) => n.id === location.noteId),
    tuning: staffTuning(track, location.staffIndex),
  };
}
export function scoreBeats(score: ScoreAST) {
  return score.tracks.flatMap((track) =>
    [{ measures: track.measures }, ...(track.additionalStaves ?? [])].flatMap(
      (staff, staffIndex) =>
        staff.measures.flatMap((measure, measureIndex) =>
          measure.voices.flatMap((voice, voiceIndex) =>
            voice.beats.map((beat) => ({
              track,
              beat,
              tuning: staffTuning(track, staffIndex),
              location: {
                trackId: track.id,
                staffIndex,
                measureIndex,
                voiceIndex,
                beatId: beat.id,
              } as ScoreLocation,
            })),
          ),
        ),
    ),
  );
}
export function selectRange(
  score: ScoreAST,
  anchor: ScoreLocation,
  target: ScoreLocation,
) {
  if (
    anchor.trackId !== target.trackId ||
    anchor.staffIndex !== target.staffIndex ||
    anchor.voiceIndex !== target.voiceIndex
  )
    return null;
  const beats = scoreBeats(score).filter(
      (e) =>
        e.location.trackId === target.trackId &&
        e.location.staffIndex === target.staffIndex &&
        e.location.voiceIndex === target.voiceIndex,
    ),
    a = beats.findIndex((e) => e.beat.id === anchor.beatId),
    b = beats.findIndex((e) => e.beat.id === target.beatId);
  if (a < 0 || b < 0) return null;
  const range = beats
    .slice(Math.min(a, b), Math.max(a, b) + 1)
    .filter(
      (e) => !(e.beat.isEmpty ?? e.beat.source?.isempty) || e.beat.notes.length,
    );
  return {
    notes: range.flatMap((e) => e.beat.notes.map((n) => n.id)),
    beats: range.map((e) => e.beat.id),
  };
}
export function applySelectionPatch(
  score: ScoreAST,
  noteIds: string[],
  beatIds: string[],
  patch: SelectionPatch,
) {
  const notes = new Set(noteIds),
    beats = new Set(beatIds);
  let changed = false;
  const assign = (object: any, key: string, value: unknown) => {
    if (object[key] !== value) {
      object[key] = value;
      changed = true;
    }
  };
  for (const entry of scoreBeats(score)) {
    const selectedNotes = entry.beat.notes.filter((n) => notes.has(n.id));
    if (!beats.has(entry.beat.id) && !selectedNotes.length) continue;
    const b = entry.beat;
    if (patch.duration !== undefined) {
      if (
        b.duration !== patch.duration ||
        b.sourceDuration !== undefined ||
        (b.isEmpty ?? b.source?.isempty)
      )
        changed = true;
      setBeatDuration(b, patch.duration);
    }
    if (patch.dots !== undefined) {
      if (!Number.isInteger(patch.dots) || patch.dots < 0 || patch.dots > 3)
        throw new Error("Choose 0 to 3 augmentation dots.");
      b.source ??= {};
      assign(b.source, "dots", patch.dots);
      assign(b, "isDotted", patch.dots > 0);
    }
    if (patch.tupletRatio) {
      if (
        patch.tupletRatio.some((v) => !Number.isInteger(v) || v < 1 || v > 32)
      )
        throw new Error("Tuplet values must be integers from 1 to 32.");
      assign(b, "isTuplet", true);
      if (JSON.stringify(b.tuplet) !== JSON.stringify(patch.tupletRatio)) {
        b.tuplet = [...patch.tupletRatio];
        changed = true;
      }
    }
    if (patch.dotted !== undefined) assign(b, "isDotted", patch.dotted);
    if (patch.tuplet !== undefined) {
      assign(b, "isTuplet", patch.tuplet);
      if (patch.tuplet) b.tuplet ??= [3, 2];
    }
    if (patch.dynamics !== undefined) assign(b, "dynamics", patch.dynamics);
    for (const n of selectedNotes) {
      if (patch.pitch !== undefined || patch.semitones !== undefined) {
        const offset =
          patch.pitch !== undefined ? patch.pitch - n.pitch : patch.semitones!;
        const next = transposeNote(n, offset, entry.tuning);
        for (const key of ["pitch", "fret", "string"] as const)
          if (next[key] !== undefined) assign(n, key, next[key]);
      }
      if (patch.string !== undefined || patch.fret !== undefined) {
        if (!entry.tuning?.length)
          throw new Error(
            "String and fret changes require a fretted instrument.",
          );
        const string = patch.string ?? n.string ?? 0,
          fret = patch.fret ?? n.fret ?? 0;
        if (
          !Number.isInteger(string) ||
          string < 0 ||
          string >= entry.tuning.length ||
          !Number.isInteger(fret) ||
          fret < 0 ||
          fret > 36
        )
          throw new Error("Choose a valid string and a fret from 0 to 36.");
        assign(n, "string", string);
        assign(n, "fret", fret);
        if (entry.tuning[string] + fret > 127)
          throw new Error("This fret exceeds the supported pitch range.");
        assign(n, "pitch", entry.tuning[string] + fret);
      }
      if (patch.tied !== undefined) assign(n, "isTied", patch.tied);
      for (const key of ["accent", "palmMute", "letRing", "staccato"] as const)
        if (patch[key] !== undefined) {
          n.articulations ??= {};
          assign(n.articulations, key, patch[key]);
        }
    }
  }
  return changed;
}
export function pitchName(pitch: number) {
  return `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}
export type NotationView = "tab" | "staff" | "combined";
export function hasTablature(score: ScoreAST | null, trackId?: string | null) {
  return !!score?.tracks.some(
    (t) =>
      (!trackId || t.id === trackId) &&
      !![
        t.tuning,
        ...(t.additionalStaves ?? []).map(
          (s) => s.source?.stringtuning?.tunings,
        ),
      ].find((tuning) => tuning?.length),
  );
}
/** Non-fretted instruments always retain staff notation in a mixed full score. */
export function applyNotationView<
  T extends {
    tracks: {
      staves: {
        tuning: number[];
        showTablature: boolean;
        showStandardNotation: boolean;
      }[];
    }[];
  },
>(score: T, view: NotationView) {
  for (const track of score.tracks)
    for (const staff of track.staves) {
      const fretted = staff.tuning.length > 0;
      staff.showTablature = fretted && view !== "staff";
      staff.showStandardNotation = !fretted || view !== "tab";
    }
  return score;
}
