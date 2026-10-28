import type { NoteAST, ScoreAST } from "../types/score";
import { locateBeat, ScoreLocation } from "./scoreSelection";
import { setBeatDuration, transposeNote } from "./project";

/** One staff position is a line or space; retain the starting accidental. */
export function shiftStaffPitch(pitch: number, steps: number) {
  const tones = [0, 2, 4, 5, 7, 9, 11];
  const octave = Math.floor(pitch / 12),
    tone = pitch % 12;
  const degree = tones.findLastIndex((n) => n <= tone);
  const position = octave * 7 + degree + steps;
  return Math.max(
    0,
    Math.min(
      127,
      Math.floor(position / 7) * 12 +
        tones[((position % 7) + 7) % 7] +
        tone -
        tones[degree],
    ),
  );
}

export function insertScoreNote(
  score: ScoreAST,
  location: ScoreLocation,
  pitch: number,
) {
  const entry = locateBeat(score, location);
  if (!entry) throw new Error("Choose a beat on the score.");
  const note: NoteAST = { id: crypto.randomUUID(), pitch, isTied: false };
  const inserted: NoteAST = entry.tuning?.length
    ? transposeNote(
        { ...note, pitch: entry.tuning[0], string: 0, fret: 0 },
        pitch - entry.tuning[0],
        entry.tuning,
      )
    : note;
  if (
    entry.beat.notes.some((n) =>
      entry.tuning?.length ? n.string === inserted.string : n.pitch === pitch,
    )
  )
    throw new Error(
      "A note already occupies this position. Double-click another staff position to add a note.",
    );
  if (entry.beat.isEmpty ?? entry.beat.source?.isempty)
    setBeatDuration(entry.beat, entry.beat.duration);
  entry.beat.isEmpty = false;
  entry.beat.notes.push(inserted);
  return inserted.id;
}

export function moveScoreNote(
  score: ScoreAST,
  from: ScoreLocation,
  to: ScoreLocation,
  steps: number,
) {
  const source = locateBeat(score, from),
    target = locateBeat(score, to);
  if (!source?.note || !target)
    throw new Error("Choose a note and a destination beat.");
  if (
    from.trackId !== to.trackId ||
    from.staffIndex !== to.staffIndex ||
    from.voiceIndex !== to.voiceIndex
  )
    throw new Error("Drag within the same staff and voice.");
  const pitch = shiftStaffPitch(source.note.pitch, steps);
  const next = transposeNote(
    source.note,
    pitch - source.note.pitch,
    source.tuning,
  );
  if (
    target.beat.notes.some(
      (n) =>
        n.id !== next.id &&
        (target.tuning?.length
          ? n.string === next.string
          : n.pitch === next.pitch),
    )
  )
    throw new Error("A note already occupies the destination.");
  if (source.beat !== target.beat) {
    source.beat.notes = source.beat.notes.filter((n) => n.id !== next.id);
    target.beat.notes.push(next);
    target.beat.isEmpty = false;
  } else Object.assign(source.note, next);
  return { ...to, noteId: next.id };
}
