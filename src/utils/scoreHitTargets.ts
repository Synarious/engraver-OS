import type { AlphaTabApi } from "@coderline/alphatab";
import { ScoreAST } from "../types/score";
import { ScoreLocation, pitchName, staffMeasures } from "./scoreSelection";
export interface ScoreTarget {
  key: string;
  kind: "note" | "beat";
  location: ScoreLocation;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  noteIds: string[];
  rest: boolean;
}
export function scoreTargets(
  api: Pick<AlphaTabApi, "score" | "boundsLookup">,
  source: ScoreAST,
  offset = { x: 0, y: 0 },
): ScoreTarget[] {
  const targets: ScoreTarget[] = [];
  if (!api.score || !api.boundsLookup) return targets;
  for (const track of api.score.tracks)
    for (const staff of track.staves)
      for (const bar of staff.bars)
        for (const voice of bar.voices)
          for (const beat of voice.beats) {
            const modelTrack = source.tracks[track.index],
              modelBeat = modelTrack
                ? staffMeasures(modelTrack, staff.index)[bar.index]?.voices[
                    voice.index
                  ]?.beats[beat.index]
                : undefined;
            if (!modelTrack || !modelBeat || beat.isEmpty) continue;
            const location: ScoreLocation = {
              trackId: modelTrack.id,
              staffIndex: staff.index,
              measureIndex: bar.index,
              voiceIndex: voice.index,
              beatId: modelBeat.id,
            };
            const context = `measure ${bar.index + 1}, ${modelTrack.name}, staff ${staff.index + 1}, voice ${voice.index + 1}`;
            (api.boundsLookup.findBeats(beat) ?? []).forEach((bounds, part) => {
              const box = bounds.visualBounds;
              targets.push({
                key: `${modelBeat.id}-${part}`,
                kind: "beat",
                location,
                label: `${modelBeat.notes.length ? "Beat" : "Rest"}, ${context}, view ${part + 1}`,
                x: offset.x + box.x,
                y: offset.y + box.y,
                width: Math.max(14, box.w),
                height: Math.max(16, box.h),
                noteIds: modelBeat.notes.map((n) => n.id),
                rest: !modelBeat.notes.length,
              });
              (bounds.notes ?? []).forEach((noteBounds, index) => {
                const note = modelBeat.notes[noteBounds.note.index];
                if (!note) return;
                const r = noteBounds.noteHeadBounds;
                targets.push({
                  key: `${note.id}-${part}-${index}`,
                  kind: "note",
                  location: { ...location, noteId: note.id },
                  label: `${pitchName(note.pitch)}${note.string !== undefined ? `, string ${note.string + 1}, fret ${note.fret}` : ""}, ${context}, note ${noteBounds.note.index + 1}, view ${part + 1}`,
                  x: offset.x + r.x,
                  y: offset.y + r.y,
                  width: Math.max(8, r.w),
                  height: Math.max(8, r.h),
                  noteIds: [note.id],
                  rest: false,
                });
              });
            });
          }
  return targets;
}
export function nearestScoreNote(
  targets: ScoreTarget[],
  x: number,
  y: number,
  radius = 16,
) {
  let best: ScoreTarget | undefined,
    distance = Infinity;
  for (const t of targets) {
    if (t.kind !== "note") continue;
    const dx = x - (t.x + t.width / 2),
      dy = y - (t.y + t.height / 2),
      d = Math.hypot(dx, dy);
    if (d <= Math.max(radius, t.width / 2 + 4) && d < distance) {
      best = t;
      distance = d;
    }
  }
  return best;
}
