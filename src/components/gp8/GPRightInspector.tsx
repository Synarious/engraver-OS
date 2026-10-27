import React from 'react';
import { ChevronDown, Plus, Guitar, Keyboard, ChevronUp } from 'lucide-react';
import { useEditorStore, selectActiveNote } from '../../store/editorStore';
import type { NoteDuration } from '../../store/editorStore';

const DURATIONS: { label: string; value: NoteDuration }[] = [
  { label: '1', value: 'w' },
  { label: '1/2', value: 'h' },
  { label: '1/4', value: 'q' },
  { label: '1/8', value: 'e' },
  { label: '1/16', value: 's' },
  { label: '1/32', value: 't' },
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToNoteName(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export const GPRightInspector = () => {
  const store = useEditorStore();
  const note = selectActiveNote(store);
  const activeTrack = store.score?.tracks.find(t => t.id === store.activeTrackId);
  const numStrings = activeTrack?.tuning?.length || 6;

  const setFret = (fret: number) => store.updateNoteFret(fret);
  const setString = (s: number) => store.updateNoteString(s);

  return (
    <div className="w-64 bg-[#2a2d34] border-l border-[#1a1b20] flex flex-col shrink-0 h-full overflow-y-auto text-slate-300 text-xs select-none">
       <div className="flex bg-[#67738b] text-[#c0c6d3] text-[10px] items-center font-semibold tracking-wider h-6">
          <button className="flex-1 h-full hover:bg-slate-800/30">SONG</button>
          <button className="flex-1 h-full bg-blue-500 text-white">TRACK</button>
       </div>

       {store.pendingInsertTarget && !note && (
         <div className="p-2 border-b border-[#1a1b20] bg-blue-900/40">
           <div className="font-bold text-[10px] tracking-wider mb-1 text-blue-300">ADD NOTE</div>
           <div className="text-[10px] text-slate-400">
             Double-clicked a string. Type a fret number (e.g. <b>7</b>, <b>12</b>). Press <b>↑</b>/<b>↓</b> to change
             string, <b>Esc</b> to cancel.
           </div>
         </div>
       )}

       {note && (
         <div className="p-2 border-b border-[#1a1b20] bg-[#262a31]">
           <div className="font-bold text-[10px] tracking-wider mb-2 text-blue-400">SELECTED NOTE</div>
           <div className="flex items-center gap-2 mb-2">
             <label className="text-slate-400">Fret</label>
             <input
               type="number"
               min={0}
               max={24}
               value={note.fret ?? 0}
               onChange={(e) => setFret(parseInt(e.target.value || '0', 10))}
               className="bg-[#1a1b20] px-2 py-1 w-14 rounded border border-[#111215] text-xs outline-none"
             />
             <label className="text-slate-400 ml-2">String</label>
             <input
               type="number"
               min={0}
               max={numStrings - 1}
               value={note.string ?? 0}
               onChange={(e) => setString(parseInt(e.target.value || '0', 10))}
               className="bg-[#1a1b20] px-2 py-1 w-14 rounded border border-[#111215] text-xs outline-none"
             />
           </div>
           <div className="font-bold text-[10px] tracking-wider mb-1 text-slate-400">Duration</div>
           <div className="flex gap-0.5 mb-2">
             {DURATIONS.map((d) => (
               <button
                 key={d.value}
                 onClick={() => store.updateNoteDuration(d.value)}
                 className="flex-1 bg-[#1a1b20] py-1 rounded hover:bg-[#3f434d] font-bold"
                 title={d.label}
               >
                 {d.label}
               </button>
             ))}
           </div>
           <div className="flex flex-wrap gap-1">
             <button onClick={() => store.toggleNoteAccent()} className={`px-2 py-0.5 rounded ${note.articulations?.accent ? 'bg-blue-500 text-white' : 'bg-[#1a1b20] hover:bg-[#3f434d]'}`}>accent</button>
             <button onClick={() => store.toggleNotePalmMute()} className={`px-2 py-0.5 rounded ${note.articulations?.palmMute ? 'bg-blue-500 text-white' : 'bg-[#1a1b20] hover:bg-[#3f434d]'}`}>P.M.</button>
             <button onClick={() => store.toggleNoteLetRing()} className={`px-2 py-0.5 rounded ${note.articulations?.letRing ? 'bg-blue-500 text-white' : 'bg-[#1a1b20] hover:bg-[#3f434d]'}`}>let ring</button>
             <button onClick={() => store.toggleNoteSlide()} className={`px-2 py-0.5 rounded ${note.articulations?.slide ? 'bg-blue-500 text-white' : 'bg-[#1a1b20] hover:bg-[#3f434d]'}`}>slide</button>
             <button onClick={() => store.toggleNoteStaccato()} className={`px-2 py-0.5 rounded ${note.articulations?.staccato ? 'bg-blue-500 text-white' : 'bg-[#1a1b20] hover:bg-[#3f434d]'}`}>stacc.</button>
             <button onClick={() => store.setNoteDead(true)} className={`px-2 py-0.5 rounded ${(note.fret ?? 0) < 0 ? 'bg-blue-500 text-white' : 'bg-[#1a1b20] hover:bg-[#3f434d]'}`}>dead</button>
             <button onClick={() => store.removeActiveNote()} className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40">delete</button>
           </div>
         </div>
       )}

       <div className="p-2 border-b border-[#1a1b20]">
          <div className="font-bold text-[10px] tracking-wider mb-2">INFORMATION</div>
         <div className="flex gap-1 items-center">
            <div className="w-4 h-4 bg-red-400 rounded-sm"></div>
            <button className="bg-[#1a1b20] p-1 rounded-sm hover:bg-[#3f434d]"><Guitar size={14}/></button>
            <input type="text" className="bg-[#1a1b20] px-2 py-1 flex-1 rounded border border-[#111215] text-xs outline-none" defaultValue="E.Guitar I" />
            <input type="text" className="bg-[#1a1b20] px-2 py-1 w-12 rounded border border-[#111215] text-xs outline-none" defaultValue="E.Gtr" />
         </div>
       </div>

       <div className="p-2 border-b border-[#1a1b20]">
         <div className="font-bold text-[10px] tracking-wider mb-2">MUSICAL NOTATION</div>
         <div className="flex justify-between items-center mb-2">
            <span>Notation:</span>
            <div className="flex bg-[#1a1b20] rounded p-0.5">
               <button className="w-6 h-6 flex items-center justify-center bg-blue-500 rounded-sm text-white font-serif">5</button>
               <button className="w-6 h-6 flex items-center justify-center hover:bg-[#3f434d] rounded-sm font-serif">T</button>
               <button className="w-6 h-6 flex items-center justify-center hover:bg-[#3f434d] rounded-sm">/</button>
               <button className="w-6 h-6 flex items-center justify-center hover:bg-[#3f434d] rounded-sm border-l border-[#2a2d34] ml-1">||</button>
            </div>
         </div>
         <div className="flex justify-between items-center mb-1">
            <span>Tuning:</span>
            <span className="text-[10px] text-slate-500">click a note to transpose</span>
         </div>
         {activeTrack?.tuning?.map((midi, i) => (
           <div key={i} className="flex items-center justify-between mb-0.5">
             <span className="text-slate-500 w-10">String {i + 1}</span>
             <div className="flex items-center gap-1">
               <button
                 onClick={() => store.setTrackTuning(activeTrack.tuning!.map((m, j) => (j === i ? Math.max(0, m - 1) : m)))}
                 className="bg-[#1a1b20] p-0.5 rounded hover:bg-[#3f434d] text-slate-400"
               >
                 <ChevronUp size={11} />
               </button>
               <span className="bg-[#1a1b20] px-2 py-0.5 rounded w-14 text-center font-bold">{midiToNoteName(midi)}</span>
               <button
                 onClick={() => store.setTrackTuning(activeTrack.tuning!.map((m, j) => (j === i ? Math.min(127, m + 1) : m)))}
                 className="bg-[#1a1b20] p-0.5 rounded hover:bg-[#3f434d] text-slate-400"
               >
                 <ChevronDown size={11} />
               </button>
             </div>
           </div>
         ))}
       </div>

       <div className="p-2 border-b border-[#1a1b20]">
         <div className="font-bold text-[10px] tracking-wider mb-2">SOUNDS</div>
         <div className="flex justify-between items-center mb-2">
            <div className="flex bg-[#1a1b20] rounded p-0.5 text-[10px] font-bold">
               <button className="px-2 py-0.5 bg-blue-500 rounded-sm text-white">RSE</button>
               <button className="px-2 py-0.5 hover:bg-[#3f434d] rounded-sm">MIDI</button>
            </div>
            <div className="flex gap-1">
               <button className="bg-[#1a1b20] p-1 rounded hover:bg-[#3f434d]"><Plus size={12}/></button>
               <button className="bg-[#1a1b20] px-1.5 rounded font-bold hover:bg-[#3f434d]">A</button>
            </div>
         </div>

         <div className="bg-[#3f434d] rounded p-1 mb-1">
            <div className="flex justify-between items-center mb-1">
               <span className="font-bold">1. Lead</span>
               <div className="flex gap-1">
                 <button className="p-0.5 bg-blue-500/20 text-blue-400 rounded"><ChevronDown size={12}/></button>
                 <button className="p-0.5 hover:bg-[#1a1b20] rounded">...</button>
               </div>
            </div>
            <div className="flex gap-1 justify-between items-center">
               <div className="flex gap-0.5">
                  <Guitar size={14}/>
                  <div className="w-3 h-3 bg-[#1a1b20]"></div>
                  <div className="w-3 h-3 bg-[#1a1b20]"></div>
               </div>
               <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            </div>
         </div>
       </div>

       <div className="p-2 border-b border-[#1a1b20]">
         <div className="font-bold text-[10px] tracking-wider mb-2">INTERPRETATION</div>
         <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
               <span>Playing style:</span>
               <button
                 onClick={() => store.toggleNoteSlide()}
                 className={`bg-[#1a1b20] px-2 py-0.5 rounded flex items-center justify-between w-24 border border-[#111215] ${note?.articulations?.slide ? 'text-blue-400' : ''}`}
               >
                 {note?.articulations?.slide ? 'Slide' : 'Pick'} <ChevronDown size={12}/>
               </button>
            </div>
            <div className="flex justify-between items-center">
               <span>Palm mute:</span>
               <button
                 onClick={() => store.toggleNotePalmMute()}
                 className={`w-24 h-4 rounded bg-[#1a1b20] relative border border-[#111215] ${note?.articulations?.palmMute ? 'text-blue-400' : ''}`}
               >
                 <span className="absolute top-1/2 -translate-y-1/2 text-[9px] w-full text-center">{note?.articulations?.palmMute ? 'ON' : 'OFF'}</span>
               </button>
            </div>
            <div className="flex justify-between items-center">
               <span>Accentuation:</span>
               <button
                 onClick={() => store.toggleNoteAccent()}
                 className={`w-24 h-4 rounded bg-[#1a1b20] relative border border-[#111215] ${note?.articulations?.accent ? 'text-blue-400' : ''}`}
               >
                 <span className="absolute top-1/2 -translate-y-1/2 text-[9px] w-full text-center">{note?.articulations?.accent ? 'ON' : 'OFF'}</span>
               </button>
            </div>
            <div className="flex justify-between items-center">
               <span>Auto let ring:</span>
               <button
                 onClick={() => store.toggleNoteLetRing()}
                 className={`w-24 h-4 rounded bg-[#1a1b20] relative border border-[#111215] ${note?.articulations?.letRing ? 'text-blue-400' : ''}`}
               >
                 <span className="absolute top-1/2 -translate-y-1/2 text-[9px] w-full text-center">{note?.articulations?.letRing ? 'ON' : 'OFF'}</span>
               </button>
            </div>
            <div className="flex justify-between items-center">
               <span>Staccato:</span>
               <button
                 onClick={() => store.toggleNoteStaccato()}
                 className={`w-24 h-4 rounded bg-[#1a1b20] relative border border-[#111215] ${note?.articulations?.staccato ? 'text-blue-400' : ''}`}
               >
                 <span className="absolute top-1/2 -translate-y-1/2 text-[9px] w-full text-center">{note?.articulations?.staccato ? 'ON' : 'OFF'}</span>
               </button>
            </div>
         </div>
       </div>
    </div>
  );
};
