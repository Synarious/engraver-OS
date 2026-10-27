import React, { useEffect, useState } from 'react';
import { Home, LayoutPanelLeft, LayoutTemplate, LayoutPanelTop, Search, Undo, Redo, SkipBack, Play, Pause, SkipForward, Repeat, Clock, Volume2, Guitar, Mic2 } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';

const formatTime = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const GPHeader = () => {
  const { alphaApi, isPlaying, setIsPlaying, undo, redo, score, activeTrackId } = useEditorStore();
  const [position, setPosition] = useState({ current: 0, end: 0 });
  const [looping, setLooping] = useState(false);

  useEffect(() => {
    if (!alphaApi) return;
    const offState = alphaApi.playerStateChanged.on((e: any) => {
      setIsPlaying(e.state === 1);
    });
    const offPos = alphaApi.playerPositionChanged.on((e: any) => {
      setPosition({ current: e.currentTime, end: e.endTime });
    });
    return () => { offState(); offPos(); };
  }, [alphaApi, setIsPlaying]);

  const activeTrack = score?.tracks.find(t => t.id === activeTrackId);
  const trackIndex = score?.tracks.findIndex(t => t.id === activeTrackId) ?? -1;

  const togglePlay = () => {
    if (!alphaApi) return;
    alphaApi.playPause();
  };

  const stop = () => {
    if (!alphaApi) return;
    alphaApi.stop();
  };

  const toggleLoop = () => {
    const api = useEditorStore.getState().alphaApi;
    if (!api?.player) return;
    const next = !looping;
    api.player.isLooping = next;
    setLooping(next);
  };

  return (
    <div className="flex flex-col border-b border-slate-900 shadow-md z-10 w-full shrink-0">
      <div className="flex items-center justify-between bg-[#2a2d34] px-2 py-2 text-slate-300">
        <div className="flex items-center gap-1">
          <button className="p-1.5 hover:bg-slate-700 rounded"><Home size={16} /></button>
          <div className="flex bg-[#1a1b20] rounded p-0.5 mx-1">
             <button className="p-1 hover:bg-[#2a2d34] bg-[#4f566a] rounded-sm text-white"><LayoutPanelLeft size={16} /></button>
             <button className="p-1 hover:bg-[#2a2d34] rounded-sm"><LayoutTemplate size={16} /></button>
             <button className="p-1 hover:bg-[#2a2d34] rounded-sm"><LayoutPanelTop size={16} /></button>
          </div>
          <div className="flex items-center bg-[#1a1b20] rounded px-2 py-1 mx-1 text-xs">
            <Search size={12} className="mr-1" />
            <span className="mr-1">91%</span>
            <span className="mx-1 opacity-50">|</span>
            <span className="w-3 h-3 bg-slate-600 rounded-sm"></span>
            <span className="w-3 h-3 bg-slate-600 rounded-sm ml-0.5"></span>
          </div>
          <div className="flex bg-[#1a1b20] rounded p-0.5 mx-1">
            <button onClick={undo} className="p-1 hover:bg-[#2a2d34] rounded-sm"><Undo size={16} /></button>
            <button onClick={redo} className="p-1 hover:bg-[#2a2d34] rounded-sm"><Redo size={16} /></button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center">
            <button onClick={stop} className="p-1.5 hover:bg-slate-700 rounded"><SkipBack size={20} fill="currentColor" /></button>
            <button onClick={togglePlay} className="p-1.5 hover:bg-slate-700 rounded text-green-400">{isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}</button>
            <button className="p-1.5 hover:bg-slate-700 rounded"><SkipForward size={20} fill="currentColor" /></button>
            <button onClick={toggleLoop} className={`p-1.5 hover:bg-slate-700 rounded ${looping ? 'text-blue-400' : ''}`}><Repeat size={16} /></button>
          </div>
          <div className="flex flex-col items-center justify-center text-[10px] mx-2">
            <div className="font-bold flex items-center gap-1">
              <span className="w-2 h-2 bg-slate-400 rounded-full inline-block"></span> {trackIndex >= 0 ? `${trackIndex + 1}. ${activeTrack?.name}` : ''}
            </div>
            <div className="flex gap-2">
              <span>{score ? `${score.tracks.length}/129` : '0/0'}</span>
              <span className="text-green-500">4.0:4.0</span>
              <span>{formatTime(position.current)} / {formatTime(position.end)}</span>
            </div>
          </div>
          <div className="flex items-center text-xs">
             <Clock size={16} className="mr-1"/> = {score?.tempo || 156}
          </div>
        </div>

        <div className="flex items-center gap-1">
           <div className="flex bg-[#1a1b20] rounded p-0.5 mx-1 text-xs items-center">
             <button className="px-2 py-1 bg-blue-500 rounded-sm text-white flex items-center gap-1"><Volume2 size={12}/> 70%+</button>
             <button className="px-2 py-1 hover:bg-[#2a2d34] rounded-sm flex items-center gap-1"><span className="w-3 h-3 bg-slate-600 rounded-sm"></span> 0</button>
             <button className="px-1 py-1 hover:bg-[#2a2d34] rounded-sm">+</button>
           </div>

           <div className="flex mx-2 text-slate-400">
             <button className="p-1 hover:bg-slate-700 rounded text-blue-400"><Volume2 size={16} /></button>
             <button className="p-1 hover:bg-slate-700 rounded text-white"><Guitar size={16} /></button>
             <button className="p-1 hover:bg-slate-700 rounded"><Mic2 size={16} /></button>
           </div>
        </div>
      </div>

      <div className="flex bg-[#67738b] text-[#c0c6d3] text-[10px] items-center px-2 py-1 font-semibold tracking-wider h-6 justify-between">
         <div className="w-1/3 truncate">Guitar Pro 8</div>
         <div className="w-1/3 truncate text-center text-white">[MSB] {score?.title || 'Untitled'}</div>
         <div className="w-1/3 truncate text-right flex justify-end items-center gap-2">
           <span>Beethoven - Moonlight Sonata</span>
           <button className="bg-slate-800/30 px-2 py-0.5 rounded-sm">+</button>
         </div>
      </div>
    </div>
  );
};
