import type { BeatAST, NoteAST, ScoreAST } from "../types/score";
import { beatDurationTicks, wholeNoteTicks } from "./scoreRhythm";
import {
  pitchName,
  staffMeasures,
  staffTuning,
  type ScoreLocation,
} from "./scoreSelection";

export interface ScoreFinding {
  kind: "rhythm" | "tablature";
  title: string;
  detail: string;
  trackName: string;
  staffCount: number;
  location: ScoreLocation;
}

export interface ScoreCheckJump {
  scoreId: string;
  location: ScoreLocation;
}

function isWholeBarRest(beat: BeatAST) {
  return (
    !beat.notes.length &&
    !beat.source?.deadslapped &&
    beat.duration === "w" &&
    beat.sourceDuration === undefined &&
    !beat.isDotted &&
    !beat.isTuplet
  );
}

function tablatureDetail(note: NoteAST, tuning: number[]): string | undefined {
  if (note.string == null) return;
  const openPitch = tuning[note.string];
  if (!Number.isInteger(note.string) || !Number.isFinite(openPitch))
    return `String ${note.string + 1} is outside this staff’s tuning. Choose a string from 1 to ${tuning.length}.`;
  const fret = note.fret ?? 0;
  if (!Number.isInteger(fret) || fret < -1)
    return "The fret value is invalid. Choose a fret on the instrument.";
  // The model uses -1 for a dead note, which has no defined sounding pitch.
  if (fret === -1 || note.source?.isdead) return;
  const frettedPitch = openPitch + fret;
  if (frettedPitch !== note.pitch)
    return `String ${note.string + 1}, fret ${fret} gives ${pitchName(frettedPitch)}. The saved pitch is ${pitchName(note.pitch)}. Check which pitch you intend.`;
}

/** Check editable score data without changing or re-rendering it. */
export function checkScore(score: ScoreAST): ScoreFinding[] {
  const findings: ScoreFinding[] = [];
  for (const track of score.tracks) {
    const staffCount = 1 + (track.additionalStaves?.length ?? 0);
    for (let staffIndex = 0; staffIndex < staffCount; staffIndex++) {
      const tuning = staffTuning(track, staffIndex);
      staffMeasures(track, staffIndex).forEach((measure, measureIndex) => {
        const master = score.tracks[0]?.measures[measureIndex];
        const [beats, unit] = master?.timeSignature ?? score.timeSignature;
        const expected = (wholeNoteTicks * beats) / unit;
        const regularMeter =
          Number.isFinite(expected) &&
          expected > 0 &&
          !master?.masterSource?.isfreetime &&
          !master?.masterSource?.isanacrusis &&
          !measure.masterSource?.isfreetime &&
          !measure.masterSource?.isanacrusis &&
          master?.source?.musicxml?.implicit !== "yes" &&
          measure.source?.musicxml?.implicit !== "yes";
        measure.voices.forEach((voice, voiceIndex) => {
          const timedBeats = voice.beats.filter(
            (beat) =>
              !beat.source?.gracetype &&
              (!(beat.isEmpty ?? beat.source?.isempty) || beat.notes.length),
          );
          const atBeat = (beat: BeatAST): ScoreLocation => ({
            trackId: track.id,
            staffIndex,
            measureIndex,
            voiceIndex,
            beatId: beat.id,
          });
          if (
            regularMeter &&
            !(timedBeats.length === 1 && isWholeBarRest(timedBeats[0]))
          ) {
            let elapsed = 0;
            for (const beat of timedBeats) {
              elapsed += beatDurationTicks(beat);
              // Imported values can be rounded to the nearest renderer tick.
              if (elapsed <= expected + 1 || !Number.isFinite(elapsed))
                continue;
              findings.push({
                kind: "rhythm",
                title: "Measure exceeds its meter",
                detail: `This voice runs past the end of the ${beats}/${unit} bar. Check the selected beat’s duration and the rests before it.`,
                trackName: track.name,
                staffCount,
                location: atBeat(beat),
              });
              break;
            }
          }
          if (!tuning?.length) return;
          for (const beat of voice.beats) {
            for (const note of beat.notes) {
              const detail = tablatureDetail(note, tuning);
              if (!detail) continue;
              findings.push({
                kind: "tablature",
                title: "Check this tablature position",
                detail,
                trackName: track.name,
                staffCount,
                location: { ...atBeat(beat), noteId: note.id },
              });
            }
          }
        });
      });
    }
  }
  return findings;
}
