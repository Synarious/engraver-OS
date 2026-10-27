'use client';

import React from 'react';

const durations = [
  { id: 'w', label: '1', name: 'Whole' },
  { id: 'h', label: '1/2', name: 'Half' },
  { id: 'q', label: '1/4', name: 'Quarter' },
  { id: 'e', label: '1/8', name: 'Eighth' },
  { id: 's', label: '1/16', name: 'Sixteenth' },
  { id: 't', label: '1/32', name: 'Thirty-Second' },
];

export const LeftPalette = () => {
  return (
    <div className="w-14 bg-[#1e293b] border-r border-slate-800 flex flex-col items-center py-4 gap-6 shrink-0 z-10 shadow-lg">
      
      {/* Durations */}
      <div className="flex flex-col gap-2 w-full px-2 opacity-80">
        {durations.map((d, i) => (
          <button 
            key={d.id} 
            className={`w-10 h-10 flex flex-col items-center justify-center text-[10px] rounded transition-colors ${i === 2 ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}
            title={d.name}
          >
            <span className="text-lg font-serif italic mb-0 leading-none">{d.id}</span>
            <span className="font-mono">{d.label}</span>
          </button>
        ))}
        <div className="h-[1px] w-8 bg-slate-700 mx-auto my-1"></div>
        <button className="w-10 h-10 mx-auto flex items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors text-lg font-serif font-bold" title="Dotted">
          .
        </button>
        <button className="w-10 h-10 mx-auto flex items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors text-xs font-mono font-bold" title="Tuplet">
          3
        </button>
      </div>

      <div className="h-[1px] w-8 bg-slate-700 mx-auto"></div>

      {/* Articulations (Placeholder) */}
      <div className="flex flex-col gap-2 w-full px-2">
         <button className="w-10 h-10 mx-auto flex items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-cyan-400 transition-colors text-xs font-bold" title="Bend">
          B
        </button>
         <button className="w-10 h-10 mx-auto flex items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-cyan-400 transition-colors text-xs font-bold" title="Slide">
          S
        </button>
         <button className="w-10 h-10 mx-auto flex items-center justify-center rounded text-slate-400 hover:bg-slate-700 hover:text-cyan-400 transition-colors text-xs font-bold" title="Vibrato">
          V
        </button>
      </div>

    </div>
  );
};
