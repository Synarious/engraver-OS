'use client';

import React, { useState } from 'react';
import { 
  Music, Volume2, Mic2, Activity,
  Type, Settings2, SlidersHorizontal
} from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

export const BottomMixerBar = () => {
  const { score, activeTrackId, setActiveTrack } = useEditorStore();

  if (!score || score.tracks.length === 0) return null;

  return (
    <div className="flex flex-col border-t border-slate-800 bg-[#1e293b] z-20">
      <div className="h-32 flex flex-col">
        <div className="px-6 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/50">
          MIXER
        </div>
        <div className="flex-1 flex overflow-x-auto p-4 gap-4">
          {score.tracks.map((track) => (
            <div 
              key={track.id}
              onClick={() => setActiveTrack(track.id)}
              className={`flex w-48 rounded bg-slate-900/50 border p-3 cursor-pointer transition-colors ${
                track.id === activeTrackId ? 'border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.1)]' : 'border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <div className="flex flex-col flex-1">
                <div className="text-[10px] text-cyan-400 font-mono truncate mb-2 uppercase">{track.name}</div>
                <div className="flex gap-2 mt-auto">
                  <button className={`flex-1 py-1 rounded text-[10px] font-bold border ${track.isMuted ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>MUTE</button>
                  <button className={`flex-1 py-1 rounded text-[10px] font-bold border ${track.isSolo ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>SOLO</button>
                </div>
              </div>
              <div className="flex items-center justify-center pl-4 border-l border-slate-700/50 ml-3">
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01" 
                  value={track.volume} 
                  onChange={() => {}} // TODO
                  className="h-16 -rotate-90 w-1 accent-cyan-500 bg-slate-700 rounded-full appearance-none cursor-pointer" 
                />
              </div>
            </div>
          ))}
          
          {/* Add Track Button */}
          <div className="flex w-12 items-center justify-center border border-dashed border-slate-700/50 rounded bg-slate-900/20 text-slate-500 hover:text-cyan-400 hover:border-cyan-500/50 cursor-pointer transition-colors">
            <span className="text-xl">+</span>
          </div>
        </div>
      </div>
      
      <footer className="h-10 border-t border-slate-800 bg-[#1e293b] px-6 flex items-center justify-between shadow-inner">
        <div className="flex gap-6 items-center">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Audio Engine Active</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Latency:</span>
            <span className="text-[10px] font-mono text-cyan-400">12ms</span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-[10px] text-slate-500 font-mono">
          <span>Bar: {score.tracks[0]?.measures[0]?.index || 0 + 1}</span>
          <span className="text-slate-400 font-bold tracking-widest">GP7 FORMAT</span>
        </div>
      </footer>
    </div>
  );
};
