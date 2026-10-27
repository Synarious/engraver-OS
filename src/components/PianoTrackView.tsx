'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TrackAST } from '../types/score';

interface PianoTrackViewProps {
  track: TrackAST;
  isActive: boolean;
}

export const PianoTrackView: React.FC<PianoTrackViewProps> = ({ track, isActive }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [verovioToolkit, setVerovioToolkit] = useState<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load verovio from CDN to avoid Next.js Webpack node:crypto issues
    const scriptId = 'verovio-script';
    
    const initVerovio = () => {
      if ((window as any).verovio) {
        (window as any).verovio.module.onRuntimeInitialized = () => {
          const tk = new (window as any).verovio.toolkit();
          tk.setOptions({
            scale: 40,
            pageWidth: 2000,
            pageHeight: 800,
            adjustPageHeight: 1,
            font: 'Leipzig'
          });
          setVerovioToolkit(tk);
        };
      }
    };

    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://www.verovio.org/javascript/latest/verovio-toolkit-wasm.js';
      script.onload = initVerovio;
      document.head.appendChild(script);
    } else {
      initVerovio();
    }
  }, []);

  useEffect(() => {
    if (verovioToolkit && containerRef.current) {
      // Very basic dummy MEI for piano for demonstration
      const dummyMEI = `
        <mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.1">
          <music>
            <body>
              <mdiv>
                <score>
                  <scoreDef>
                    <staffGrp>
                      <staffGrp bar.thru="true" symbol="brace">
                        <staffDef n="1" lines="5" clef.shape="G" clef.line="2" />
                        <staffDef n="2" lines="5" clef.shape="F" clef.line="4" />
                      </staffGrp>
                    </staffGrp>
                  </scoreDef>
                  <section>
                    <measure n="1">
                      <staff n="1">
                        <layer n="1">
                          <note pname="c" oct="5" dur="4" />
                          <note pname="e" oct="5" dur="4" />
                          <note pname="g" oct="5" dur="2" />
                        </layer>
                      </staff>
                      <staff n="2">
                        <layer n="1">
                          <note pname="c" oct="3" dur="1" />
                        </layer>
                      </staff>
                    </measure>
                  </section>
                </score>
              </mdiv>
            </body>
          </music>
        </mei>
      `;
      try {
        verovioToolkit.loadData(dummyMEI);
        const svg = verovioToolkit.renderToSVG(1, {});
        
        const contentDiv = containerRef.current.querySelector('.verovio-content');
        if (contentDiv) {
          contentDiv.innerHTML = svg;
        }
      } catch (e) {
        console.error("Error rendering Verovio:", e);
      }
    }
  }, [verovioToolkit, track]);

  return (
    <div 
      className={`mb-4 p-4 rounded-lg border-2 ${isActive ? 'border-purple-500 bg-slate-800' : 'border-transparent bg-slate-800/50'}`}
    >
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-white font-semibold">{track.name} (Piano/Classical)</h3>
        {isActive && <span className="text-xs bg-purple-500 text-white px-2 py-1 rounded">Active</span>}
      </div>
      <div ref={containerRef} className="w-full bg-[#fdfdfd] rounded overflow-hidden" style={{ minHeight: '150px' }}>
        <div className="verovio-content w-full h-full overflow-x-auto">
          {!verovioToolkit && <div className="p-4 text-center text-gray-500">Loading Verovio...</div>}
        </div>
      </div>
    </div>
  );
};
