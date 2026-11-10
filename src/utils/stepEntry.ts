import type { BeatAST, ScoreAST } from "../types/score";
import { locateBeat, type ScoreLocation } from "./scoreSelection";
import {
  beatDurationTicks,
  durationDenominators,
  wholeNoteTicks,
} from "./scoreRhythm";

export function enterStep(
  score: ScoreAST,
  location: ScoreLocation,
  duration: BeatAST["duration"],
  pitch: number | null,
) {
  const target = locateBeat(score, location);
  if (!target) throw new Error("Select a beat to start entering notes.");
  const { beat, voice, tuning } = target;
  if (beat.notes.length)
    throw new Error(
      "Choose a rest for entry. Use Note details to edit an existing chord.",
    );
  if (pitch !== null && (!Number.isInteger(pitch) || pitch < 0 || pitch > 127))
    throw new Error("Choose a valid pitch.");
  const string =
    pitch === null
      ? -1
      : (tuning?.findIndex((open) => pitch >= open && pitch - open <= 36) ??
        -1);
  if (pitch !== null && tuning?.length && string < 0)
    throw new Error("This pitch is outside the tuning.");
  const index = voice.beats.indexOf(beat);
  const ticks = wholeNoteTicks / durationDenominators[duration];
  const plainRest = (b: BeatAST) =>
    !b.notes.length &&
    !b.source &&
    !b.sourceDuration &&
    !b.isDotted &&
    !b.isTuplet &&
    !b.isEmpty &&
    Object.keys(b).every((key) =>
      ["id", "duration", "isDotted", "isTuplet", "notes", "isEmpty"].includes(
        key,
      ),
    );
  let end = index + 1,
    available = beatDurationTicks(beat);
  const padding: BeatAST[] = [];
  if (available !== ticks) {
    if (!plainRest(beat))
      throw new Error("Choose a duration that matches this beat.");
    while (
      available < ticks &&
      end < voice.beats.length &&
      plainRest(voice.beats[end])
    )
      available += beatDurationTicks(voice.beats[end++]);
    if (available < ticks)
      throw new Error(
        "This duration does not fit before the next note or barline.",
      );
    let remaining = available - ticks;
    for (const [value, denominator] of Object.entries(durationDenominators)) {
      const size = wholeNoteTicks / denominator;
      while (remaining >= size) {
        padding.push({
          id: crypto.randomUUID(),
          duration: value as BeatAST["duration"],
          isDotted: false,
          isTuplet: false,
          notes: [],
        });
        remaining -= size;
      }
    }
    if (remaining)
      throw new Error("The remaining rhythm cannot be represented here.");
    beat.duration = duration;
  }
  beat.notes =
    pitch === null
      ? []
      : [
          {
            id: beat.notes[0]?.id ?? crypto.randomUUID(),
            pitch,
            isTied: false,
            ...(string >= 0 ? { string, fret: pitch - tuning![string] } : {}),
          },
        ];
  beat.isEmpty = false;
  voice.beats.splice(index + 1, end - index - 1, ...padding);
}
