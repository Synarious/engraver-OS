'use client';

import React from 'react';
import { useEditorStore } from '../store/editorStore';

export const InteractiveDock = () => {
  const { score, activeTrackId } = useEditorStore();
  const activeTrack = score?.tracks.find(t => t.id === activeTrackId);

  if (!activeTrack) return null;

  return (
    <div className="bg-[#1e293b] border-t border-slate-800 h-32 flex flex-col relative shrink-0">
      <div className="absolute top-2 left-4 text-[10px] uppercase text-cyan-500 font-bold tracking-widest z-10">
        {activeTrack.type === 'piano' ? 'PIANO ROLL' : 'FRETBOARD MAP'}
      </div>
      
      {activeTrack.type === 'piano' ? (
        <PianoRollVisualizer />
      ) : (
        <FretboardVisualizer stringCount={activeTrack.tuning?.length || 6} />
      )}
    </div>
  );
};

const PianoRollVisualizer = () => {
  // Simple 88-key like visualization
  const keys = Array.from({ length: 52 }); // Just showing 52 white keys for simplicity
  
  return (
    <div className="flex-1 flex overflow-x-auto relative pt-8 px-6 pb-4 items-center">
      <div className="flex h-full shadow-lg">
        {keys.map((_, i) => (
          <div key={i} className="relative h-full w-8 bg-slate-100 border-r border-b border-slate-300 rounded-b hover:bg-cyan-50 cursor-pointer transition-colors">
            {/* Black keys */}
            {i % 7 !== 2 && i % 7 !== 6 && (
              <div className="absolute -right-3 top-0 w-5 h-2/3 bg-slate-900 rounded-b z-10 hover:bg-cyan-900 cursor-pointer border border-black shadow-sm transition-colors"></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const FretboardVisualizer = ({ stringCount }: { stringCount: number }) => {
  const frets = Array.from({ length: 25 }); // 0 (open) to 24

  return (
    <div className="flex-1 flex overflow-x-auto pt-8 px-6 pb-4 items-center">
      <div className="flex flex-col h-full w-full justify-between relative py-2">
        {Array.from({ length: stringCount }).map((_, stringIndex) => (
          <div key={stringIndex} className="w-[1200px] h-[2px] bg-slate-700/50 relative z-0"></div>
        ))}
        
        {/* Frets */}
        <div className="absolute inset-0 flex">
          {frets.map((_, fretIndex) => (
            <div 
              key={fretIndex} 
              className={`h-full border-r-2 ${fretIndex === 0 ? 'border-cyan-500/50 w-8 bg-slate-800/50' : 'border-slate-700/30 hover:bg-cyan-500/10 cursor-pointer flex-1'} flex items-center justify-center relative transition-colors`}
            >
              {fretIndex > 0 && [3,5,7,9,15,17,19,21].includes(fretIndex) && (
                <div className="absolute w-1.5 h-1.5 rounded-full bg-cyan-500/30 top-1/2 -translate-y-1/2"></div>
              )}
              {fretIndex === 12 || fretIndex === 24 ? (
                <div className="absolute w-4 h-full flex flex-col justify-around py-4 items-center">
                   <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/30"></div>
                   <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/30"></div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
