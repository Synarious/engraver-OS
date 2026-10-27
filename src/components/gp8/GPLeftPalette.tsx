import React, { useState } from 'react';
import { Mic, Guitar } from 'lucide-react';
import { useEditorStore, selectActiveNote } from '../../store/editorStore';
import type { NoteDuration } from '../../store/editorStore';
import type { NoteAST } from '../../types/score';

const CHORD_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function detectChordName(notes: NoteAST[]): string | null {
  if (notes.length === 0) return null;
  const pitchClasses = notes.map(n => ((n.pitch % 12) + 12) % 12);
  const root = Math.min(...pitchClasses);
  const intervals = pitchClasses.map(p => ((p - root) + 12) % 12).sort((a, b) => a - b);
  const hasMajorThird = intervals.includes(4);
  const hasMinorThird = intervals.includes(3);
  const hasFifth = intervals.includes(7);
  let quality = '';
  if (hasMajorThird) quality = '';
  else if (hasMinorThird) quality = 'm';
  else if (hasFifth) quality = '5';
  return CHORD_NAMES[root] + quality;
}

export const GPLeftPalette = () => {
  const [page, setPage] = useState(1);
  const store = useEditorStore();
  const hasSelection = !!selectActiveNote(store);

  const applyChord = () => {
    const state = useEditorStore.getState();
    const track = state.score?.tracks.find(t => t.id === state.activeTrackId);
    if (!track || !state.activeBeatId) return;
    for (const measure of track.measures) {
      for (const voice of measure.voices) {
        const beat = voice.beats.find(b => b.id === state.activeBeatId);
        if (beat) {
          const name = detectChordName(beat.notes);
          if (name) state.toggleChordOnActiveBeat(name);
          return;
        }
      }
    }
  };

  const setDuration = (d: NoteDuration) => store.updateNoteDuration(d);

  const dyn: { label: string; value: NonNullable<import('../../types/score').BeatAST['dynamics']> }[] = [
    { label: 'ppp', value: 'ppp' }, { label: 'pp', value: 'pp' }, { label: 'p', value: 'p' },
    { label: 'mp', value: 'mp' }, { label: 'mf', value: 'mf' }, { label: 'f', value: 'f' },
    { label: 'ff', value: 'ff' }, { label: 'fff', value: 'fff' },
  ];

  const durations: { label: string; value: NoteDuration; symbol: string }[] = [
    { label: 'Whole', value: 'w', symbol: '𝅝' },
    { label: 'Half', value: 'h', symbol: '𝅗𝅥' },
    { label: 'Quarter', value: 'q', symbol: '𝅘𝅥' },
    { label: 'Eighth', value: 'e', symbol: '𝅘𝅥𝅮' },
    { label: '16th', value: 's', symbol: '𝅘𝅥𝅯' },
    { label: '32nd', value: 't', symbol: '𝅘𝅥𝅰' },
  ];

  const btn = 'hover:bg-[#3f434d] rounded transition-colors text-slate-200';

  return (
    <div className="w-56 bg-[#2a2d34] border-r border-[#1a1b20] flex flex-col shrink-0 h-full overflow-y-auto text-slate-300 scrollbar-hide">
      <div className="p-2 border-b border-[#1a1b20]">
        <div className="flex gap-1 mb-2 text-xs">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`w-6 h-6 rounded flex items-center justify-center font-bold ${page === n ? 'bg-[#da9935] text-black' : 'bg-[#1a1b20] hover:bg-[#3f434d]'}`}
            >
              {n}
            </button>
          ))}
          <button className="w-6 h-6 rounded flex items-center justify-center bg-[#1a1b20] hover:bg-[#3f434d] ml-auto">...</button>
        </div>
        <div className="flex gap-1 text-[10px] font-bold">
          <button className="flex-1 bg-[#1a1b20] hover:bg-[#3f434d] rounded py-1 flex items-center justify-center gap-1"><Mic size={10} /> Lyrics</button>
          <button
            onClick={applyChord}
            title="Detect and toggle a chord name on the selected beat"
            className="flex-1 bg-[#1a1b20] hover:bg-[#3f434d] rounded py-1 flex items-center justify-center gap-1"
          >
            <Guitar size={10} /> Chords
          </button>
        </div>
      </div>

      {!hasSelection && (
        <div className="px-3 py-2 text-[10px] text-slate-500 border-b border-[#1a1b20]">
          Click a note to edit it, or double-click a string and type a fret to add a note.
        </div>
      )}

      {page === 1 && (
        <div className="p-3 grid grid-cols-4 gap-1 text-xs">
          {durations.map((d) => (
            <button
              key={d.value}
              onClick={() => setDuration(d.value)}
              title={d.label}
              className={`${btn} py-1 flex flex-col items-center justify-center border border-transparent hover:border-slate-600`}
            >
              <span className="font-serif text-lg leading-none">{d.symbol}</span>
            </button>
          ))}
          <button onClick={() => store.updateNoteDuration('q')} title="Dotted" className={`${btn} py-1`}>.</button>
          <button onClick={() => store.updateNoteDuration('s')} title="Tuplet" className={`${btn} py-1`}>3</button>
          <button onClick={() => store.updateNoteDuration('q')} title="Rest" className={`${btn} py-1`}>𝄽</button>
          <button title="Tie" className={`${btn} py-1 opacity-60`}>⌒</button>
          <div className="col-span-4 mt-1 border-t border-[#1a1b20] pt-2 text-[10px] text-slate-500">
            Select a note, then choose a duration to change its beat.
          </div>
        </div>
      )}

      {page === 2 && (
        <div className="p-3 grid grid-cols-4 gap-1 text-xs">
          {dyn.map((d) => (
            <button
              key={d.value}
              onClick={() => store.setBeatDynamics(d.value)}
              title={d.label}
              className={`${btn} py-1.5 font-bold text-[10px]`}
            >
              {d.label}
            </button>
          ))}
          <button title="Crescendo" className={`${btn} py-1.5 text-[10px]`}>{'<'}</button>
          <button title="Decrescendo" className={`${btn} py-1.5 text-[10px]`}>{'>'}</button>
          <div className="col-span-4 mt-1 border-t border-[#1a1b20] pt-2 text-[10px] text-slate-500">
            Dynamics apply to the selected beat.
          </div>
        </div>
      )}

      {page === 3 && (
        <div className="p-3 grid grid-cols-2 gap-1 text-xs">
          <button onClick={() => store.toggleNotePalmMute()} title="Palm Mute (P)" className={`${btn} py-2 text-[10px] font-bold`}>P.M.</button>
          <button onClick={() => store.toggleNoteLetRing()} title="Let Ring (I)" className={`${btn} py-2 text-[10px] font-bold`}>let ring</button>
          <button onClick={() => store.setNoteDead(true)} title="Dead Note (X)" className={`${btn} py-2 text-[10px] font-bold`}>X</button>
          <button onClick={() => store.toggleNoteAccent()} title="Accent" className={`${btn} py-2 text-[10px] font-bold`}>accent</button>
          <button onClick={() => store.toggleNoteSlide()} title="Slide (S)" className={`${btn} py-2 text-[10px] font-bold`}>slide</button>
          <button onClick={() => store.toggleNoteStaccato()} title="Staccato" className={`${btn} py-2 text-[10px] font-bold`}>stacc.</button>
          <button title="Vibrato (V)" className={`${btn} py-2 text-[10px] font-bold opacity-60`}>vibrato</button>
          <button title="Slap" className={`${btn} py-2 text-[10px] font-bold opacity-60`}>slap</button>
          <div className="col-span-2 mt-1 border-t border-[#1a1b20] pt-2 text-[10px] text-slate-500">
            Techniques apply to the selected note.
          </div>
        </div>
      )}

      {page === 4 && (
        <div className="p-3 grid grid-cols-2 gap-1 text-xs">
          <button title="Hammer-on / Pull-off" className={`${btn} py-2 text-[10px] font-bold opacity-60`}>H / P</button>
          <button title="Bend (B)" className={`${btn} py-2 text-[10px] font-bold opacity-60`}>bend</button>
          <button title="Tap" className={`${btn} py-2 text-[10px] font-bold opacity-60`}>tap</button>
          <button title="Pop" className={`${btn} py-2 text-[10px] font-bold opacity-60`}>pop</button>
          <button title="Ghost note" className={`${btn} py-2 text-[10px] font-bold opacity-60`}>ghost</button>
          <button title="Harmonic" className={`${btn} py-2 text-[10px] font-bold opacity-60`}>harm.</button>
          <div className="col-span-2 mt-1 border-t border-[#1a1b20] pt-2 text-[10px] text-slate-500">
            More techniques.
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-[#1a1b20] p-2 grid grid-cols-4 gap-1">
        <button className="h-6 bg-[#1a1b20] rounded"></button>
        <button className="h-6 bg-[#1a1b20] rounded"></button>
        <button className="h-6 bg-[#1a1b20] rounded"></button>
        <button className="h-6 bg-[#1a1b20] rounded"></button>
      </div>
    </div>
  );
};
