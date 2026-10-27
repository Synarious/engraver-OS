import React, { useMemo } from 'react';
import { useEditorStore } from '../store/editorStore';

export const ArticulationBar = () => {
  const { score, activeTrackId } = useEditorStore();

  const isTabMode = useMemo(() => {
    const activeTrack = score?.tracks.find(t => t.id === activeTrackId);
    return (activeTrack?.type === 'guitar' || activeTrack?.type === 'bass');
  }, [score, activeTrackId]);

  if (!isTabMode) return null;

  const techniques = [
    { id: 'ho_po', label: 'H/P', title: 'Hammer-On / Pull-Off (H)' },
    { id: 'bend', label: 'BEND', title: 'Pitch Bend (B)' },
    { id: 'slide', label: 'SL', title: 'Slide (S)' },
    { id: 'pm', label: 'P.M.', title: 'Palm Mute (P)' },
    { id: 'let_ring', label: 'L.R.', title: 'Let Ring (I)' },
    { id: 'dead', label: 'X', title: 'Dead Note (X)' },
    { id: 'vibrato', label: 'VIB', title: 'Vibrato (V)' },
    { id: 'slap', label: 'SLAP', title: 'Slap' },
    { id: 'pop', label: 'POP', title: 'Pop' },
    { id: 'tap', label: 'TAP', title: 'Tap' },
  ];

  return (
    <div className="h-10 bg-[#1e293b] border-b border-slate-800 flex items-center px-4 gap-4 overflow-x-auto shadow-sm shrink-0">
      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest shrink-0">
        Techniques
      </div>
      <div className="w-[1px] h-4 bg-slate-700"></div>
      <div className="flex items-center gap-1">
        {techniques.map(tech => (
          <button 
            key={tech.id}
            title={tech.title}
            className="px-3 py-1 rounded text-xs font-mono font-bold text-slate-400 hover:bg-slate-800 hover:text-cyan-400 transition-colors border border-transparent hover:border-slate-700"
          >
            {tech.label}
          </button>
        ))}
      </div>
    </div>
  );
};
