import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { current, isDraft } from 'immer';
import { ScoreAST, TrackAST, MeasureAST, VoiceAST, BeatAST, NoteAST } from '../types/score';
import { saveScore } from '../storage/fileSystem';
import { setBeatDuration } from '../utils/project';
import { freshIds } from '../utils/project';
import { ScoreLocation, SelectionMode, SelectionPatch, locateBeat, scoreBeats, selectRange, applySelectionPatch, staffMeasures, staffTuning } from '../utils/scoreSelection';

export type NoteDuration = BeatAST['duration'];

export interface PendingInsertTarget {
  beatId: string;
  stringIndex: number; // 0-indexed model string (0 = highest)
}

interface EditorState {
  selectedNoteIds: string[];
  selectedBeatIds: string[];
  selectionAnchor: ScoreLocation | null;
  multiSelect: boolean;
  selectionError:string|null;
  setSelectionError:(message:string|null)=>void;
  noteClipboard: NoteAST[];
  selectLocation: (location: ScoreLocation, mode?: SelectionMode) => void;
  clearSelection: () => void;
  setMultiSelect: (enabled:boolean) => void;
  updateSelection: (patch:SelectionPatch) => void;
  deleteSelection: () => void;
  restSelection: () => void;
  selectChord: () => void;
  selectMeasure: () => void;
  moveSelection: (direction:number, extend?:boolean) => void;
  copySelection: () => void;
  pasteSelection: () => void;
  insertSelectionNote: (pitch:number, stringIndex?:number, fret?:number) => void;
  scoreStatus: 'idle' | 'loading' | 'ready' | 'error';
  scoreError: string | null;
  playerReady: boolean;
  setScoreStatus: (status: EditorState['scoreStatus'], error?: string) => void;
  setPlayerReady: (ready: boolean) => void;
  activeStaffIndex: number;
  activeVoiceIndex: number;
  editScore: (edit: (score: ScoreAST) => void) => void;
  setActiveStaff: (index: number) => void;
  setActiveVoice: (index: number) => void;
  score: ScoreAST | null;
  activeTrackId: string | null;
  activeMeasureIndex: number;
  activeBeatId: string | null;
  activeNoteId: string | null;
  pendingInsertTarget: PendingInsertTarget | null;
  isPlaying: boolean;
  history: ScoreAST[];
  historyIndex: number;
  alphaApi: any;

  // Actions
  setScore: (score: ScoreAST, persist?: boolean) => void;
  setActiveTrack: (trackId: string) => void;
  setActiveMeasure: (index: number) => void;
  setActiveBeat: (beatId: string) => void;
  setActiveNote: (noteId: string | null) => void;
  setPendingInsertTarget: (target: PendingInsertTarget | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setAlphaApi: (api: any) => void;

  // Mutations
  updateScoreTitle: (title: string) => void;
  addNoteToActiveBeat: (note: NoteAST) => void;
  insertNoteAtTarget: (fret: number) => void;
  updateNoteFret: (fret: number) => void;
  updateNoteString: (stringIndex: number) => void;
  updateNoteDuration: (duration: NoteDuration) => void;
  toggleNoteAccent: () => void;
  toggleNotePalmMute: () => void;
  toggleNoteLetRing: () => void;
  toggleNoteSlide: () => void;
  toggleNoteStaccato: () => void;
  setNoteDead: (dead: boolean) => void;
  setBeatDynamics: (dynamics: BeatAST['dynamics']) => void;
  setTrackTuning: (tuning: number[]) => void;
  toggleChordOnActiveBeat: (name: string) => void;
  removeActiveNote: () => void;

  // History
  undo: () => void;
  redo: () => void;
}

const saveToDB = async (score: ScoreAST) => {
  try {
    await saveScore(score);
  } catch (e) {
    console.error("Failed to save to DB", e);
  }
};

const clone = (obj: ScoreAST) => JSON.parse(JSON.stringify(obj));

export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    selectedNoteIds:[],selectedBeatIds:[],selectionAnchor:null,multiSelect:false,noteClipboard:[],selectionError:null,
    setSelectionError:(message)=>set(state=>{state.selectionError=message;}),
    setMultiSelect:(enabled)=>set(state=>{state.multiSelect=enabled;}),
    clearSelection:()=>set(state=>clearSelection(state)),
    selectLocation:(location,mode='replace')=>set(state=>{
      const found=locateBeat(state.score,location);if(!found)return;
      state.selectionError=null;
      const range=mode==='range'&&state.selectionAnchor&&state.score?selectRange(state.score,state.selectionAnchor,location):null;
      if(range){state.selectedNoteIds=range.notes;state.selectedBeatIds=range.beats;}
      else if(mode==='toggle'){
        if(found.note){const id=found.note.id;state.selectedNoteIds=state.selectedNoteIds.includes(id)?state.selectedNoteIds.filter(n=>n!==id):[...state.selectedNoteIds,id];
          state.selectedBeatIds=scoreBeats(state.score!).filter(e=>e.beat.notes.some(n=>state.selectedNoteIds.includes(n.id))).map(e=>e.beat.id);
        }else{const remove=state.selectedBeatIds.includes(found.beat.id);state.selectedBeatIds=remove?state.selectedBeatIds.filter(id=>id!==found.beat.id):[...state.selectedBeatIds,found.beat.id];state.selectedNoteIds=remove?state.selectedNoteIds.filter(id=>!found.beat.notes.some(n=>n.id===id)):[...new Set([...state.selectedNoteIds,...found.beat.notes.map(n=>n.id)])];}
      }else{state.selectedNoteIds=found.note?[found.note.id]:[];state.selectedBeatIds=[found.beat.id];}
      state.activeTrackId=location.trackId;state.activeStaffIndex=location.staffIndex;state.activeMeasureIndex=location.measureIndex;state.activeVoiceIndex=location.voiceIndex;state.activeBeatId=location.beatId;state.activeNoteId=found.note?.id??null;state.pendingInsertTarget=null;
      if(mode!=='range'||!state.selectionAnchor)state.selectionAnchor={...location};
    }),
    updateSelection:(patch)=>set(state=>{if(state.score&&applySelectionPatch(state.score,state.selectedNoteIds,state.selectedBeatIds,patch))pushHistory(state);}),
    deleteSelection:()=>set(state=>{if(!state.score||!state.selectedNoteIds.length)return;const ids=new Set(state.selectedNoteIds);for(const e of scoreBeats(state.score)){if(e.beat.notes.some(n=>ids.has(n.id))){e.beat.notes=e.beat.notes.filter(n=>!ids.has(n.id));e.beat.isEmpty=false;}}state.activeNoteId=null;state.selectedNoteIds=[];pushHistory(state);}),
    restSelection:()=>set(state=>{if(!state.score||!state.selectedBeatIds.length)return;for(const e of scoreBeats(state.score))if(state.selectedBeatIds.includes(e.beat.id)){e.beat.notes=[];e.beat.isEmpty=false;}state.activeNoteId=null;state.selectedNoteIds=[];pushHistory(state);}),
    selectChord:()=>set(state=>{const active=findActiveBeat(state);if(!active)return;state.selectedNoteIds=active.notes.map(n=>n.id);state.selectedBeatIds=[active.id];state.activeNoteId=active.notes[0]?.id??null;}),
    selectMeasure:()=>set(state=>{const track=findActiveTrack(state),measure=track?staffMeasures(track,state.activeStaffIndex)[state.activeMeasureIndex]:null;if(!measure)return;const beats=measure.voices.flatMap(v=>v.beats).filter(b=>!(b.isEmpty??b.source?.isempty)||b.notes.length);state.selectedBeatIds=beats.map(b=>b.id);state.selectedNoteIds=beats.flatMap(b=>b.notes.map(n=>n.id));}),
    moveSelection:(direction,extend=false)=>{const state=get();if(!state.score)return;const beats=scoreBeats(state.score).filter(e=>e.location.trackId===state.activeTrackId&&e.location.staffIndex===state.activeStaffIndex&&e.location.voiceIndex===state.activeVoiceIndex&&(!(e.beat.isEmpty??e.beat.source?.isempty)||e.beat.notes.length));if(!beats.length)return;const i=beats.findIndex(e=>e.beat.id===state.activeBeatId),next=beats[Math.max(0,Math.min(beats.length-1,i<0?0:i+direction))];get().selectLocation({...next.location,noteId:next.beat.notes[0]?.id},extend?'range':'replace');},
    copySelection:()=>set(state=>{if(!state.score)return;state.noteClipboard=freshIds(scoreBeats(state.score).flatMap(e=>e.beat.notes.filter(n=>state.selectedNoteIds.includes(n.id))));}),
    pasteSelection:()=>set(state=>{const target=findActiveBeat(state),track=findActiveTrack(state);if(!target||!track||!state.noteClipboard.length)return;const tuning=staffTuning(track,state.activeStaffIndex),notes=freshIds(state.noteClipboard).map(n=>{if(tuning){if(n.string===undefined||n.string>=tuning.length||tuning[n.string]+(n.fret??0)!==n.pitch){const string=tuning.findIndex(open=>n.pitch-open>=0&&n.pitch-open<=36);if(string<0)throw new Error('Pasted pitch is outside this instrument’s fret range.');n.string=string;n.fret=n.pitch-tuning[string];}}else{delete n.string;delete n.fret;}return n;});for(const n of notes){target.notes=target.notes.filter(existing=>tuning?existing.string!==n.string:existing.pitch!==n.pitch);target.notes.push(n);}target.isEmpty=false;state.selectedNoteIds=notes.map(n=>n.id);state.selectedBeatIds=[target.id];state.activeNoteId=notes[0]?.id??null;pushHistory(state);}),
    insertSelectionNote:(pitch,stringIndex,fret)=>set(state=>{
      const track=findActiveTrack(state);if(!track)return;const measures=staffMeasures(track,state.activeStaffIndex),m=measures[state.activeMeasureIndex];if(!m)return;
      while(m.voices.length<=state.activeVoiceIndex)m.voices.push({index:m.voices.length,beats:[]});const voice=m.voices[state.activeVoiceIndex];let beat=findActiveBeat(state);if(!beat){beat=voice.beats[0];if(!beat){beat={id:crypto.randomUUID(),duration:'q',isDotted:false,isTuplet:false,notes:[]};voice.beats.push(beat);}}
      if(beat.isEmpty??beat.source?.isempty)setBeatDuration(beat,beat.duration);const tuning=staffTuning(track,state.activeStaffIndex);
      if(!Number.isInteger(pitch)||pitch<0||pitch>127)throw new Error('Choose a MIDI pitch from 0 to 127.');
      const string=stringIndex??0,actualFret=fret??0;if(tuning&&(!Number.isInteger(string)||string<0||string>=tuning.length||!Number.isInteger(actualFret)||actualFret<0||actualFret>36))throw new Error('Choose a valid string and fret.');
      const n:NoteAST={id:crypto.randomUUID(),pitch:tuning?tuning[string]+actualFret:pitch,string:tuning?string:undefined,fret:tuning?actualFret:undefined,isTied:false};const existing=beat.notes.find(old=>tuning?old.string===n.string:old.pitch===n.pitch);if(existing){n.id=existing.id;Object.assign(existing,n);}else beat.notes.push(n);beat.isEmpty=false;state.activeBeatId=beat.id;state.activeNoteId=n.id;state.selectedNoteIds=[n.id];state.selectedBeatIds=[beat.id];pushHistory(state);
    }),
    scoreStatus: 'idle', scoreError: null, playerReady: false,
    setScoreStatus: (status, error) => set(state => {
      state.scoreStatus=status;state.scoreError=status==='error'?error??'Unknown score error':null;
      if(status!=='ready'){state.playerReady=false;state.isPlaying=false;}
    }),
    setPlayerReady: (ready) => set(state => {state.playerReady=ready&&state.scoreStatus==='ready';}),
    activeStaffIndex: 0,
    activeVoiceIndex: 0,
    setActiveStaff: (index) => set(state => { clearSelection(state);state.activeStaffIndex=index; }),
    setActiveVoice: (index) => set(state => { clearSelection(state);state.activeVoiceIndex=index; }),
    editScore: (edit) => set(state => { if(state.score){ edit(state.score); pushHistory(state); } }),
    score: null,
    activeTrackId: null,
    activeMeasureIndex: 0,
    activeBeatId: null,
    activeNoteId: null,
    pendingInsertTarget: null,
    isPlaying: false,
    history: [],
    historyIndex: -1,
    alphaApi: null,

    setScore: (score, persist = true) => set((state) => {
      state.score = score;
      clearSelection(state);
      state.scoreStatus='loading';state.scoreError=null;state.playerReady=false;state.isPlaying=false;
      state.activeStaffIndex = 0;
      state.activeVoiceIndex = 0;
      state.activeMeasureIndex = 0;
      state.pendingInsertTarget = null;
      if (score.tracks.length > 0) {
        state.activeTrackId = score.tracks[0].id;
      }
      state.activeNoteId = null;
      state.activeBeatId = null;
      state.history = [score];
      state.historyIndex = 0;
      if (persist) saveToDB(score);
    }),

    setActiveTrack: (trackId) => set((state) => {
      clearSelection(state);
      state.activeTrackId = trackId;
      state.activeStaffIndex = 0;
      state.activeVoiceIndex = 0;
      state.activeMeasureIndex = 0;
      state.pendingInsertTarget = null;
      state.activeNoteId = null;
      state.activeBeatId = null;
    }),

    setActiveMeasure: (index) => set((state) => {
      state.activeMeasureIndex = index;
    }),

    setActiveBeat: (beatId) => set((state) => {
      state.activeBeatId = beatId;
      state.selectedBeatIds=beatId?[beatId]:[];state.selectedNoteIds=[];state.activeNoteId=null;
    }),

    setActiveNote: (noteId) => set((state) => {
      state.activeNoteId = noteId;
      state.selectedNoteIds=noteId?[noteId]:[];
    }),

    setPendingInsertTarget: (target) => set((state) => {
      state.pendingInsertTarget = target;
    }),

    setIsPlaying: (isPlaying) => set((state) => {
      state.isPlaying = isPlaying;
    }),

    setAlphaApi: (api) => set((state) => {
      state.alphaApi = api;
    }),

    updateScoreTitle: (title) => set((state) => {
      if (state.score) {
        state.score.title = title;
        const currentHistory = state.history.slice(0, state.historyIndex + 1);
        currentHistory.push(clone(state.score));
        if (currentHistory.length > 100) currentHistory.shift();
        state.history = currentHistory;
        state.historyIndex = currentHistory.length - 1;
        saveToDB(state.score);
      }
    }),

    addNoteToActiveBeat: (note) => set((state) => {
      if (state.score && state.activeTrackId && state.activeBeatId) {
        const track = state.score.tracks.find(t => t.id === state.activeTrackId);
        if (track) {
          const measure = track.measures[state.activeMeasureIndex];
          if (measure) {
            for (const voice of measure.voices) {
              const beat = voice.beats.find(b => b.id === state.activeBeatId);
              if (beat) {
                beat.notes.push(note);
                beat.isEmpty = false;
                state.activeNoteId = note.id;
                const currentHistory = state.history.slice(0, state.historyIndex + 1);
                currentHistory.push(clone(state.score));
                if (currentHistory.length > 100) currentHistory.shift();
                state.history = currentHistory;
                state.historyIndex = currentHistory.length - 1;
                saveToDB(state.score);
                break;
              }
            }
          }
        }
      }
    }),

    insertNoteAtTarget: (fret) => set((state) => {
      if (state.score && state.activeTrackId && state.pendingInsertTarget) {
        const track = state.score.tracks.find(t => t.id === state.activeTrackId);
        if (track) {
          const beat = findBeatInTrack(track, state.pendingInsertTarget.beatId);
          if (beat) {
            const stringIndex = state.pendingInsertTarget.stringIndex;
            const clamped = Math.max(0, Math.min(24, fret));
            const existing = beat.notes.find(n => n.string === stringIndex);
            if (existing) {
              existing.fret = clamped;
              const tuning = track.tuning;
              if (tuning && tuning[stringIndex] !== undefined) {
                existing.pitch = tuning[stringIndex] + clamped;
              }
              state.activeNoteId = existing.id;
            } else {
              const note: NoteAST = {
                id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                pitch: (track.tuning?.[stringIndex] ?? 0) + clamped,
                fret: clamped,
                string: stringIndex,
                isTied: false,
              };
              beat.notes.push(note);
              beat.isEmpty = false;
              state.activeNoteId = note.id;
            }
            state.activeBeatId = state.pendingInsertTarget.beatId;
            state.pendingInsertTarget = null;
            pushHistory(state);
          }
        }
      }
    }),

    updateNoteFret: (fret) => set((state) => {
      const note = findActiveNote(state);
      if (note) {
        const clamped = Math.max(0, Math.min(24, fret));
        note.fret = clamped;
        if (note.string !== undefined && note.string !== null) {
          const track = state.score!.tracks.find(t => t.id === state.activeTrackId);
          const tuning = track?.tuning;
          if (tuning && tuning[note.string] !== undefined) {
            note.pitch = tuning[note.string] + clamped;
          }
        }
        pushHistory(state);
      }
    }),

    updateNoteString: (stringIndex) => set((state) => {
      const note = findActiveNote(state);
      if (note) {
        const track = state.score!.tracks.find(t => t.id === state.activeTrackId);
        note.string = Math.max(0, Math.min((track?.tuning?.length ?? 6) - 1, stringIndex));
        const tuning = track?.tuning;
        if (tuning && tuning[note.string] !== undefined && note.fret !== undefined && note.fret !== null) {
          note.pitch = tuning[note.string] + note.fret;
        }
        pushHistory(state);
      }
    }),

    updateNoteDuration: (duration) => set((state) => {
      const beat = findActiveBeat(state);
      if (beat) {
        setBeatDuration(beat,duration);
        pushHistory(state);
      }
    }),

    toggleNoteAccent: () => set((state) => {
      const note = findActiveNote(state);
      if (note) {
        note.articulations = note.articulations || {};
        note.articulations.accent = !note.articulations.accent;
        pushHistory(state);
      }
    }),

    toggleNotePalmMute: () => set((state) => {
      const note = findActiveNote(state);
      if (note) {
        note.articulations = note.articulations || {};
        note.articulations.palmMute = !note.articulations.palmMute;
        pushHistory(state);
      }
    }),

    toggleNoteLetRing: () => set((state) => {
      const note = findActiveNote(state);
      if (note) {
        note.articulations = note.articulations || {};
        note.articulations.letRing = !note.articulations.letRing;
        pushHistory(state);
      }
    }),

    toggleNoteSlide: () => set((state) => {
      const note = findActiveNote(state);
      if (note) {
        note.articulations = note.articulations || {};
        note.articulations.slide = note.articulations.slide ? undefined : 'legato';
        pushHistory(state);
      }
    }),

    toggleNoteStaccato: () => set((state) => {
      const note = findActiveNote(state);
      if (note) {
        note.articulations = note.articulations || {};
        note.articulations.staccato = !note.articulations.staccato;
        pushHistory(state);
      }
    }),

    setBeatDynamics: (dynamics) => set((state) => {
      const beat = findActiveBeat(state);
      if (beat) {
        beat.dynamics = dynamics;
        pushHistory(state);
      }
    }),

    setTrackTuning: (tuning) => set((state) => {
      const track = findActiveTrack(state);
      if (track) {
        track.tuning = tuning;
        for (const measure of track.measures) {
          for (const voice of measure.voices) {
            for (const beat of voice.beats) {
              for (const note of beat.notes) {
                if (note.string !== undefined && note.string !== null && note.fret !== undefined && note.fret !== null && note.fret >= 0) {
                  note.pitch = tuning[note.string] + note.fret;
                }
              }
            }
          }
        }
        pushHistory(state);
      }
    }),

    toggleChordOnActiveBeat: (name) => set((state) => {
      const beat = findActiveBeat(state);
      if (beat) {
        if (beat.chord?.name === name) {
          beat.chord = undefined;
        } else {
          beat.chord = { name };
        }
        pushHistory(state);
      }
    }),

    setNoteDead: (dead) => set((state) => {
      const note = findActiveNote(state);
      if (note) {
        const fret = dead ? -1 : 0;
        note.fret = fret;
        if (note.string !== undefined && note.string !== null && fret >= 0) {
          const track = state.score!.tracks.find(t => t.id === state.activeTrackId);
          const tuning = track?.tuning;
          if (tuning && tuning[note.string] !== undefined) {
            note.pitch = tuning[note.string] + fret;
          }
        }
        pushHistory(state);
      }
    }),

    removeActiveNote: () => set((state) => {
      const track = state.score?.tracks.find(t => t.id === state.activeTrackId);
      if (track && state.activeNoteId) {
        for (const measure of track.measures) {
          for (const voice of measure.voices) {
            for (const beat of voice.beats) {
              const idx = beat.notes.findIndex(n => n.id === state.activeNoteId);
              if (idx >= 0) {
                beat.notes.splice(idx, 1);
                state.activeNoteId = null;
                pushHistory(state);
                return;
              }
            }
          }
        }
      }
    }),

    undo: () => set((state) => {
      if (state.historyIndex > 0) {
        state.historyIndex--;
        state.score = clone(state.history[state.historyIndex]);
        reconcileSelection(state);
        saveToDB(state.score!);
      }
    }),

    redo: () => set((state) => {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        state.score = clone(state.history[state.historyIndex]);
        reconcileSelection(state);
        saveToDB(state.score!);
      }
    }),
  }))
);

function findActiveTrack(state: EditorState): TrackAST | null {
  return state.score?.tracks.find(t => t.id === state.activeTrackId) ?? null;
}

function clearSelection(state:EditorState) {
  state.selectedNoteIds=[];state.selectedBeatIds=[];state.selectionAnchor=null;
  state.activeNoteId=null;state.activeBeatId=null;state.pendingInsertTarget=null;
  state.selectionError=null;
}
function reconcileSelection(state:EditorState) {
  if(!state.score){clearSelection(state);return;}
  const beats=scoreBeats(state.score),noteIds=new Set(beats.flatMap(e=>e.beat.notes.map(n=>n.id))),beatIds=new Set(beats.map(e=>e.beat.id));
  state.selectedNoteIds=state.selectedNoteIds.filter(id=>noteIds.has(id));state.selectedBeatIds=state.selectedBeatIds.filter(id=>beatIds.has(id));
  if(state.activeNoteId&&!noteIds.has(state.activeNoteId))state.activeNoteId=null;
  if(state.activeBeatId&&!beatIds.has(state.activeBeatId))state.activeBeatId=null;
}

function findBeatInTrack(track: TrackAST, beatId: string): BeatAST | null {
  for (const measure of track.measures) {
    for (const voice of measure.voices) {
      const beat = voice.beats.find(b => b.id === beatId);
      if (beat) return beat;
    }
  }
  return null;
}

function findActiveBeat(state: EditorState): BeatAST | null {
  const track = findActiveTrack(state);
  if (track && state.activeBeatId) {
    const measure = (state.activeStaffIndex ? track.additionalStaves?.[state.activeStaffIndex - 1]?.measures : track.measures)?.[state.activeMeasureIndex];
    if (measure) {
      for (const voice of measure.voices) {
        const beat = voice.beats.find(b => b.id === state.activeBeatId);
        if (beat) return beat;
      }
    }
  }
  return null;
}

function findActiveNote(state: EditorState): NoteAST | null {
  const track = findActiveTrack(state);
  if (track && state.activeNoteId) {
    for (const measure of (state.activeStaffIndex ? track.additionalStaves?.[state.activeStaffIndex - 1]?.measures ?? [] : track.measures)) {
      for (const voice of measure.voices) {
        for (const beat of voice.beats) {
          const note = beat.notes.find(n => n.id === state.activeNoteId);
          if (note) return note;
        }
      }
    }
  }
  return null;
}

function pushHistory(state: EditorState) {
  if (!state.score) return;
  const currentHistory = state.history.slice(0, state.historyIndex + 1);
  currentHistory.push(isDraft(state.score)?current(state.score):clone(state.score));
  if (currentHistory.length > 100) currentHistory.shift();
  state.history = currentHistory;
  state.historyIndex = currentHistory.length - 1;
  saveToDB(state.score);
}

export const selectActiveNote = (state: EditorState): NoteAST | null => findActiveNote(state);
