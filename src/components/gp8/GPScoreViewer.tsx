'use client';
import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { generateAlphaTex } from '../../utils/generateAlphaTex';

export const GPScoreViewer = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { score, activeTrackId, alphaApi, setAlphaApi } = useEditorStore();

  const activeTrack = score?.tracks.find(t => t.id === activeTrackId);
  const isGuitar = activeTrack?.type === 'guitar' || activeTrack?.type === 'bass';

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isGuitar) {
      if (alphaApi) return;

      import('@coderline/alphatab').then((alphaTab) => {
        if (!containerRef.current) return;
        // Clear any previous (verovio) content right before alphaTab mounts its canvas.
        containerRef.current.innerHTML = '';
        const api = new alphaTab.AlphaTabApi(containerRef.current, {
          core: {
            engine: 'html5',
            useWorkers: false,
            fontDirectory: '/font/',
            includeNoteBounds: true,
          },
          display: {
            layoutMode: 'page',
            staveProfile: 'scoretab',
            padding: [20, 20, 20, 20],
          },
          player: {
            enablePlayer: true,
            enableCursor: true,
            enableAnimatedBeatCursor: true,
            enableElementHighlighting: true,
            enableUserInteraction: true,
            soundFont: '/soundfont/sonivox.sf2'
          }
        });

        setAlphaApi(api);

        // Select notes/beats on click and expose them to the editor store.
        api.noteMouseDown.on((note: any) => {
          useEditorStore.getState().setPendingInsertTarget(null);
          const loc = locateNote(api, note);
          if (loc) selectByLocation(loc);
        });
        api.beatMouseDown.on((beat: any) => {
          const loc = locateBeat(api, beat);
          if (loc) selectByLocation(loc);
        });
      });
    } else {
      if (alphaApi) {
        alphaApi.destroy();
        setAlphaApi(null);
      }

      Promise.all([
        import('verovio/wasm'),
        import('verovio/esm'),
      ]).then(([wasmMod, esmMod]) => {
        const createVerovioModule = wasmMod.default;
        const { VerovioToolkit } = esmMod;
        createVerovioModule().then((VerovioModule: any) => {
          const vrvToolkit = new VerovioToolkit(VerovioModule);

          const dummyMEI = `
            <mei xmlns="http://www.music-encoding.org/ns/mei">
              <music>
                <body>
                  <mdiv>
                    <score>
                      <scoreDef>
                        <staffGrp>
                          <staffDef n="1" lines="5" clef.shape="G" clef.line="2" meter.count="4" meter.unit="4"/>
                        </staffGrp>
                      </scoreDef>
                      <section>
                        <measure n="1">
                          <staff n="1">
                            <layer n="1">
                              <note pname="c" oct="4" dur="4" xml:id="n1"/>
                              <note pname="d" oct="4" dur="4" xml:id="n2"/>
                              <note pname="e" oct="4" dur="4" xml:id="n3"/>
                              <note pname="f" oct="4" dur="4" xml:id="n4"/>
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

          const svg = vrvToolkit.renderData(dummyMEI, {
            scale: 50,
            pageWidth: 2000,
            pageHeight: 3000
          });
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
          }
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuitar, alphaApi]);

  useEffect(() => {
    if (alphaApi && score && activeTrackId && isGuitar) {
      const tex = generateAlphaTex(score, activeTrackId);
      if (tex) {
        alphaApi.tex(tex);
      }
    }
  }, [alphaApi, score, activeTrackId, isGuitar]);

  // Double-click a string in a beat to start inserting a note on that string.
  useEffect(() => {
    if (!alphaApi) return;
    const el = containerRef.current;
    if (!el) return;

    const onDblClick = (e: MouseEvent) => {
      const api = useEditorStore.getState().alphaApi;
      const state = useEditorStore.getState();
      const surface = el.querySelector('.at-surface') as HTMLElement | null;
      if (!api || !surface) return;
      const rect = surface.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      const lookup = api.boundsLookup;
      if (!lookup) return;
      const beat = lookup.getBeatAtPos(relX, relY);
      if (!beat) return;
      const note = lookup.getNoteAtPos(beat, relX, relY);

      const loc = locateBeat(api, beat);
      if (!loc) return;
      const track = state.score?.tracks.find(t => t.id === state.activeTrackId);
      if (!track) return;
      const measure = track.measures[loc.measureIndex];
      if (!measure) return;
      const modelBeat = measure.voices[0]?.beats[loc.beatIndex];
      if (!modelBeat) return;

      const numStrings = track.tuning?.length || 6;
      let stringIndex: number;
      if (note) {
        // alphaTab string is 1-based (1 = lowest). Model string is 0-based (0 = highest).
        stringIndex = Math.max(0, Math.min(numStrings - 1, numStrings - note.string));
      } else {
        stringIndex = stringFromY(lookup, beat, relY, numStrings);
      }

      state.setActiveBeat(modelBeat.id);
      state.setActiveNote(null);
      state.setPendingInsertTarget({ beatId: modelBeat.id, stringIndex });
    };

    el.addEventListener('dblclick', onDblClick);
    return () => el.removeEventListener('dblclick', onDblClick);
  }, [alphaApi]);

  return (
    <div className="flex-1 bg-[#2a2d34] overflow-auto flex justify-center p-8 relative">
      {/* Background paper effect */}
      <div className="bg-[#f0f0f0] shadow-[0_0_20px_rgba(0,0,0,0.5)] w-[850px] min-h-[1100px] relative">
        <div ref={containerRef} className="absolute inset-0"></div>
      </div>
    </div>
  );
};

type Location = { measureIndex: number; beatIndex: number; noteIndex: number };

function locateNote(api: any, note: any): Location | null {
  try {
    const tracks = api.score?.tracks || [];
    for (const track of tracks) {
      for (const stave of track.staves) {
        for (let bi = 0; bi < stave.bars.length; bi++) {
          const bar = stave.bars[bi];
          for (const voice of bar.voices) {
            for (let bei = 0; bei < voice.beats.length; bei++) {
              const notes = voice.beats[bei].notes;
              for (let ni = 0; ni < notes.length; ni++) {
                if (notes[ni] === note) {
                  return { measureIndex: bar.index, beatIndex: voice.beats[bei].index, noteIndex: ni };
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

function locateBeat(api: any, beat: any): Location | null {
  try {
    const tracks = api.score?.tracks || [];
    for (const track of tracks) {
      for (const stave of track.staves) {
        for (let bi = 0; bi < stave.bars.length; bi++) {
          const bar = stave.bars[bi];
          for (const voice of bar.voices) {
            for (const b of voice.beats) {
              if (b === beat) {
                return { measureIndex: bar.index, beatIndex: b.index, noteIndex: 0 };
              }
            }
          }
        }
      }
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

function selectByLocation(loc: Location) {
  const state = useEditorStore.getState();
  const { score, activeTrackId } = state;
  if (!score || !activeTrackId) return;
  const track = score.tracks.find(t => t.id === activeTrackId);
  if (!track) return;
  const measure = track.measures[loc.measureIndex];
  if (!measure) return;
  const voice = measure.voices[0];
  if (!voice) return;
  const beat = voice.beats[loc.beatIndex];
  if (!beat) return;

  state.setActiveMeasure(loc.measureIndex);
  state.setActiveBeat(beat.id);
  const note = beat.notes[loc.noteIndex];
  state.setActiveNote(note ? note.id : null);
}

// Determine the model string index (0 = highest string) for a click Y-position.
function stringFromY(lookup: any, beat: any, relY: number, numStrings: number): number {
  const beatBounds = lookup.findBeat(beat);
  if (beatBounds?.notes && beatBounds.notes.length > 0) {
    const pts = beatBounds.notes.map((nb: any) => ({ s: nb.note.string, y: nb.noteHeadBounds.y }));
    const top = pts.reduce((a: any, b: any) => (b.y < a.y ? b : a));
    const bot = pts.reduce((a: any, b: any) => (b.y > a.y ? b : a));
    const slope = bot.y !== top.y ? (bot.s - top.s) / (bot.y - top.y) : 0;
    const s = top.s + slope * (relY - top.y);
    const sClamped = Math.round(Math.max(1, Math.min(numStrings, s)));
    return Math.max(0, Math.min(numStrings - 1, numStrings - sClamped));
  }
  const bb = beatBounds?.visualBounds;
  if (bb && bb.h > 0) {
    const idx = Math.floor((relY - bb.y) / (bb.h / numStrings));
    return Math.max(0, Math.min(numStrings - 1, idx));
  }
  return Math.floor(numStrings / 2);
}
