import type { BeatAST } from "../types/score";

export const durationDenominators = {
  w: 1,
  h: 2,
  q: 4,
  e: 8,
  s: 16,
  t: 32,
  x: 64,
  y: 128,
};
export const wholeNoteTicks = 3840;

/** Written duration in the same tick units used by MusicXML export. */
export function beatDurationTicks(beat: BeatAST): number {
  const override = beat.source?.overridedisplayduration;
  if (override > 0) return override;
  const duration = beat.sourceDuration ?? durationDenominators[beat.duration];
  const ticks =
    duration < 0 ? wholeNoteTicks * -duration : wholeNoteTicks / duration;
  const dots = beat.isDotted ? Math.max(1, beat.source?.dots ?? 1) : 0;
  const ratio = beat.isTuplet
    ? (beat.tuplet?.[1] ?? 2) / (beat.tuplet?.[0] ?? 3)
    : 1;
  return ticks * (2 - 1 / 2 ** dots) * ratio;
}
