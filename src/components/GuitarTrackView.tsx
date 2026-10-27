'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TrackAST } from '../types/score';
import { useEditorStore } from '../store/editorStore';

interface GuitarTrackViewProps {
  track: TrackAST;
  isActive: boolean;
}

export const GuitarTrackView: React.FC<GuitarTrackViewProps> = ({ track, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Dynamically import alphaTab to avoid SSR issues
    import('@coderline/alphatab').then((alphaTab) => {
      if (containerRef.current) {
        const alphatabApi = new alphaTab.AlphaTabApi(containerRef.current, {
          core: {
            engine: 'html5',
            useWorkers: false,
            fontDirectory: '/font/',
          },
          display: {
            layoutMode: 'page',
            staveProfile: 'scoretab',
          },
          player: {
            enablePlayer: true,
            soundFont: '/soundfont/sonivox.sf2'
          }
        });
        
        setApi(alphatabApi);

        const tex = `\\title "Demo Song"
\\tempo 120
\\ts 4 4
\\track "Lead Guitar"
\\staff
4.4 4.4 4.4 4.4 |`;
        alphatabApi.tex(tex);

        return () => {
          alphatabApi.destroy();
        };
      }
    });
  }, []);

  return (
    <div 
      className={`mb-4 p-4 rounded-lg border-2 ${isActive ? 'border-blue-500 bg-slate-800' : 'border-transparent bg-slate-800/50'}`}
    >
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-white font-semibold">{track.name} (Guitar/Bass)</h3>
        {isActive && <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">Active</span>}
      </div>
      <div ref={containerRef} className="w-full bg-white rounded overflow-hidden" style={{ minHeight: '150px' }}>
        {/* alphaTab will render here */}
        {!api && <div className="p-4 text-center text-gray-500">Loading AlphaTab...</div>}
      </div>
    </div>
  );
};
