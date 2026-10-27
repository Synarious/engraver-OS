import { ScoreAST, TrackAST, MeasureAST, BeatAST, NoteAST } from '../types/score';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const DURATION_MAP: Record<string, string> = {
  'w': '1',
  'h': '2',
  'q': '4',
  'e': '8',
  's': '16',
  't': '32',
};

function midiToNoteName(midi: number): string {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function generateAlphaTex(score: ScoreAST | null, activeTrackId: string | null): string {
  if (!score || !activeTrackId) return '';
  const track = score.tracks.find(t => t.id === activeTrackId);
  if (!track || (track.type !== 'guitar' && track.type !== 'bass')) return '';

  const numStrings = track.tuning?.length || 6;

  let tex = `\\title "${escape(score.title)}"\n`;
  if (score.subTitle) tex += `\\subtitle "${escape(score.subTitle)}"\n`;
  tex += `\\tempo ${score.tempo}\n`;
  tex += `\\ts(${score.timeSignature[0]} ${score.timeSignature[1]})\n`;
  tex += `\\track "${escape(track.name)}"\n`;

  if (track.tuning && track.tuning.length > 0) {
    // alphaTex lists tuning from lowest to highest string
    const lowToHigh = [...track.tuning].reverse();
    tex += `\\tuning(${lowToHigh.map(midiToNoteName).join(' ')})\n`;
  }

  tex += `\\staff {score tabs}\n`;

  let currentDuration: string | null = null;

  for (const measure of track.measures) {
    const voice = measure.voices[0];
    if (!voice || voice.beats.length === 0) {
      tex += `r |\n`;
      continue;
    }

    const parts: string[] = [];
    for (const beat of voice.beats) {
      const dur = DURATION_MAP[beat.duration] || '4';
      if (dur !== currentDuration) {
        parts.push(`:${dur}`);
        currentDuration = dur;
      }

      if (beat.notes.length === 0) {
        parts.push(beat.isDotted ? 'r.' : 'r');
      } else {
        const noteParts = beat.notes.map(n => noteToAlphaTex(n, numStrings));

        if (beat.notes.length === 1) {
          parts.push(noteParts[0] + (beat.isDotted ? '.' : ''));
        } else {
          parts.push(`(${noteParts.join(' ')})${beat.isDotted ? '.' : ''}`);
        }
      }

      if (beat.chord?.name) {
        parts.push(`\\chord "${escape(beat.chord.name)}"`);
      }
    }
    tex += `${parts.join(' ')} |\n`;
  }

  return tex;
}

function noteToAlphaTex(note: NoteAST, numStrings: number): string {
  const alphaTexString = numStrings - (note.string ?? 0);
  const fret = note.fret ?? 0;

  let body: string;
  if (fret < 0) {
    body = `x.${alphaTexString}`;
  } else {
    body = `${fret}.${alphaTexString}`;
  }

  const fx: string[] = [];
  if (note.articulations?.accent) fx.push('ac');
  if (note.articulations?.palmMute) fx.push('pm');
  if (note.articulations?.letRing) fx.push('lr');
  if (note.articulations?.staccato) fx.push('st');
  if (note.articulations?.slide) fx.push('sl');
  if (note.isTied) fx.push('t');

  if (fx.length > 0) {
    body += `{${fx.join(' ')}}`;
  }

  return body;
}

function escape(text: string): string {
  return text.replace(/"/g, "'");
}

export function beatsInMeasure(measure: MeasureAST): BeatAST[] {
  return measure.voices[0]?.beats || [];
}
