import type { ScoreAST } from "../types/score";
/** Legacy MIDI piano examples stored the two hands as separate named tracks. */
export function displayedTrackIndexes(
  score: ScoreAST,
  activeId: string | null,
): number[] {
  if (activeId === null) return score.tracks.map((_, index) => index);
  const index = Math.max(
    0,
    score.tracks.findIndex((track) => track.id === activeId),
  );
  const active = score.tracks[index];
  if (active?.type !== "piano" || !/^Piano · (upper|lower)$/.test(active.name))
    return [index];
  return score.tracks.flatMap((track, i) =>
    track.type === "piano" &&
    track.midiProgram === active.midiProgram &&
    /^Piano · (upper|lower)$/.test(track.name)
      ? [i]
      : [],
  );
}
