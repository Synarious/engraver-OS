import React from 'react';
import { Mic, Guitar, Settings2, Keyboard } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';

export const GPBottomMixer = () => {
  const { score, activeTrackId, setActiveTrack } = useEditorStore();

  return (
    <div className="h-48 bg-[#1a1b20] border-t border-[#111215] flex shrink-0 text-xs text-slate-300 select-none">
      {/* Track List */}
      <div className="w-[340px] flex flex-col border-r border-[#111215] overflow-y-auto">
        <div className="grid grid-cols-[20px_1fr_20px_40px_80px_40px_40px] gap-1 px-1 py-1 items-center font-bold text-[10px] bg-[#2a2d34] border-b border-[#111215]">
          <div>+</div>
          <div>Tracks</div>
          <div></div>
          <div></div>
          <div>Vol.</div>
          <div>Pan.</div>
          <div>Eq.</div>
        </div>
        
        {score?.tracks.map((track, i) => {
          const isActive = activeTrackId === track.id;
          return (
            <div 
              key={track.id} 
              onClick={() => setActiveTrack(track.id)}
              className={`grid grid-cols-[20px_1fr_20px_40px_80px_40px_40px] gap-1 px-1 py-1 items-center border-b border-[#111215] cursor-pointer ${isActive ? 'bg-[#e5ebf5] text-black' : 'bg-[#2a2d34]'}`}
            >
              <div className="text-center font-mono">{i + 1}.</div>
              <div className="flex items-center gap-1">
                {track.type === 'guitar' || track.type === 'bass' ? <Guitar size={12}/> : <Keyboard size={12}/>} 
                <span className="truncate">{track.name}</span>
              </div>
              <div><Settings2 size={12}/></div>
              <div className="flex gap-1">
                 <button className={`w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold ${track.isMuted ? 'bg-yellow-500 text-white' : 'bg-[#1a1b20] text-slate-500'}`}>M</button>
                 <button className={`w-4 h-4 rounded text-[10px] flex items-center justify-center font-bold ${track.isSolo ? 'bg-green-500 text-white' : 'bg-[#1a1b20] text-slate-500'}`}>S</button>
              </div>
              <div className="flex items-center gap-1">
                 <div className="w-full h-2 border border-black rounded-sm relative overflow-hidden bg-slate-800"><div className="w-3/4 h-full bg-green-500"></div></div>
                 <div className="w-3 h-3 bg-green-500 rounded-sm text-[8px] flex items-center justify-center text-white font-bold">A</div>
              </div>
              <div>O</div>
              <div>#</div>
            </div>
          )
        })}
      </div>
      
      {/* Timeline view */}
      <div className="flex-1 flex flex-col bg-[#111215] overflow-hidden">
         <div className="flex text-[10px] text-slate-500 border-b border-[#2a2d34] px-1 font-mono">
            <div className="flex-1 border-l border-[#2a2d34] pl-1">1</div>
            <div className="flex-1 border-l border-[#2a2d34] pl-1">4</div>
            <div className="flex-1 border-l border-[#2a2d34] pl-1">8</div>
            <div className="flex-1 border-l border-[#2a2d34] pl-1">12</div>
            <div className="flex-1 border-l border-[#2a2d34] pl-1">16</div>
            <div className="flex-1 border-l border-[#2a2d34] pl-1">20</div>
            <div className="flex-1 border-l border-[#2a2d34] pl-1">24</div>
         </div>
         <div className="flex-1 relative">
            <div className="absolute inset-0 flex flex-col">
               {score?.tracks.map((track, i) => (
                  <div key={track.id} className={`${i % 2 === 0 ? 'bg-blue-400/80' : 'bg-red-400/80'} w-full h-8 border-b border-black mt-1`}></div>
               ))}
            </div>
            {/* Playhead */}
            <div className="absolute top-0 bottom-0 left-[15%] w-px bg-white shadow-[0_0_5px_white] z-10"></div>
         </div>
      </div>
    </div>
  );
};
