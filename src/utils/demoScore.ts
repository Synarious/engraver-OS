import { ScoreAST, TrackAST, MeasureAST, VoiceAST, BeatAST, NoteAST } from '../types/score';

interface FretNote {
  string: number; // 0-indexed, 0 = highest string
  fret: number;   // -1 = dead note
}

function makeNote(id: string, tuning: number[], n: FretNote): NoteAST {
  return {
    id,
    pitch: n.fret >= 0 && tuning[n.string] !== undefined ? tuning[n.string] + n.fret : tuning[n.string] ?? 0,
    fret: n.fret,
    string: n.string,
    isTied: false,
  };
}

// Power chord rooted on the A string (index 4)
function powerChord(fret: number): FretNote[] {
  return [
    { string: 4, fret },
    { string: 3, fret: fret + 2 },
    { string: 2, fret: fret + 2 },
  ];
}

const GUITAR_TUNING = [64, 59, 55, 50, 45, 40]; // E4 B3 G3 D3 A2 E2 (high -> low)
const BASS_TUNING = [43, 38, 33, 28];            // G2 D2 A1 E1 (high -> low)

export function createDemoScore(): ScoreAST {
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

  const score: ScoreAST = {
    id: 'score-1',
    title: 'Jimi Hendrix - All Along the Watchtower',
    subTitle: 'Full Score',
    tempo: 156,
    timeSignature: [4, 4],
    tracks: [],
  };

  // ---- E.Guitar I (active, editable) ----
  const guitarTrack: TrackAST = {
    id: 'track-2',
    name: 'E.Guitar I',
    type: 'guitar',
    midiProgram: 27,
    isMuted: false,
    isSolo: false,
    volume: 0.9,
    pan: 0,
    tuning: GUITAR_TUNING,
    measures: [],
  };

  // Four bars of power chords: C5, D5, E5, G5 (roots on the A string)
  const guitarBars: { chords: number[][]; labels: string }[] = [
    { chords: [[3], [3], [3], [3], [3], [3], [3], [3]], labels: 'C5' },
    { chords: [[5], [5], [5], [5], [3], [3], [3], [3]], labels: 'D5 -> C5' },
    { chords: [[7], [7], [7], [7], [7], [7], [10], [10]], labels: 'E5 -> G5' },
    { chords: [[10], [10], [10], [10], [10], [10], [10], [10]], labels: 'G5' },
  ];

  guitarTrack.measures = guitarBars.map((bar, mi) => {
    const measure: MeasureAST = { index: mi, voices: [] };
    const voice: VoiceAST = { index: 0, beats: [] };
    bar.chords.forEach((chordFrets, bi) => {
      const beat: BeatAST = {
        id: nextId('beat'),
        duration: 'e',
        isDotted: false,
        isTuplet: false,
        notes: [],
      };
      chordFrets.forEach((fret, ni) => {
        const chord = powerChord(fret);
        chord.forEach((n) => {
          beat.notes.push(makeNote(nextId('note'), GUITAR_TUNING, n));
        });
      });
      voice.beats.push(beat);
    });
    measure.voices.push(voice);
    return measure;
  });

  score.tracks.push(guitarTrack);

  // ---- E.Bass ----
  const bassTrack: TrackAST = {
    id: 'track-3',
    name: 'E.Bass',
    type: 'bass',
    midiProgram: 33,
    isMuted: false,
    isSolo: false,
    volume: 0.9,
    pan: 0,
    tuning: BASS_TUNING,
    measures: [],
  };

  // Bass roots on the A string (index 2): C2(3) D2(5) E2(7) G2(10)
  const bassBars = [
    [3, 3, 3, 3, 3, 3, 3, 3],
    [5, 5, 5, 5, 3, 3, 3, 3],
    [7, 7, 7, 7, 7, 7, 10, 10],
    [10, 10, 10, 10, 10, 10, 10, 10],
  ];

  bassTrack.measures = bassBars.map((frets, mi) => {
    const measure: MeasureAST = { index: mi, voices: [] };
    const voice: VoiceAST = { index: 0, beats: [] };
    frets.forEach((fret, bi) => {
      const beat: BeatAST = {
        id: nextId('beat'),
        duration: 'e',
        isDotted: false,
        isTuplet: false,
        notes: [makeNote(nextId('note'), BASS_TUNING, { string: 2, fret })],
      };
      voice.beats.push(beat);
    });
    measure.voices.push(voice);
    return measure;
  });

  score.tracks.push(bassTrack);

  // ---- Vocals ----
  score.tracks.push({
    id: 'track-1',
    name: 'Vocals',
    type: 'piano',
    midiProgram: 52,
    isMuted: false,
    isSolo: false,
    volume: 0.8,
    pan: 0,
    measures: [],
  });

  // ---- Piano ----
  score.tracks.push({
    id: 'track-4',
    name: 'Piano',
    type: 'piano',
    midiProgram: 0,
    isMuted: false,
    isSolo: false,
    volume: 0.9,
    pan: 0,
    measures: [],
  });

  return score;
}
