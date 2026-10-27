'use client';

import React from 'react';
import { Play, Pause, Square, Repeat, Activity, ZoomIn, ZoomOut } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

export const TransportBar = () => {
  const { isPlaying, setIsPlaying, score } = useEditorStore();

  return (
    <div className="flex items-center justify-center gap-8 bg-[#1e293b] p-3 border-b border-slate-800 shadow-sm relative">
      <div className="absolute left-6 flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer">
        <Activity size={16} />
        <span className="text-[10px] uppercase font-bold tracking-widest">Metronome</span>
      </div>

      <div className="flex items-center bg-black/30 rounded-full px-4 py-1.5 border border-slate-700/50">
        <button className="text-slate-400 hover:text-cyan-400 transition-colors">
          <Square size={16} fill="currentColor" />
        </button>
        <div className="flex items-center gap-4 px-6">
          <button 
            className="text-cyan-400 hover:text-cyan-300 transition-colors"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </button>
          <span className="text-xs font-mono text-cyan-400">00:00:00</span>
        </div>
        <button className="text-slate-400 hover:text-cyan-400 transition-colors">
          <Repeat size={16} />
        </button>
      </div>

      <div className="absolute right-6 flex items-center gap-6">
        <div className="flex gap-6 items-center text-xs">
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Tempo</span>
            <span className="font-mono text-slate-300">{score?.tempo || 120}.00</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Sig</span>
            <span className="font-mono text-slate-300">{score?.timeSignature[0] || 4} / {score?.timeSignature[1] || 4}</span>
          </div>
        </div>
        <div className="h-6 w-[1px] bg-slate-700/50"></div>
        <div className="flex items-center gap-2 text-slate-400">
          <ZoomOut size={16} className="hover:text-cyan-400 cursor-pointer" />
          <input type="range" min="50" max="200" defaultValue="100" className="w-20 accent-cyan-500 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
          <ZoomIn size={16} className="hover:text-cyan-400 cursor-pointer" />
        </div>
      </div>
    </div>
  );
};
