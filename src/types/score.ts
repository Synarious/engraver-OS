export interface ScoreAST {
  version?: number;
  source?: Record<string, any>;
  interchange?: { warnings?: string[] };
  tags?: string[];
  favorite?: boolean;
  deletedAt?: number;
  updatedAt?: number;
  engraving?: {
    barsPerRow?: number;
    notation?: number;
    padding?: number;
    width?: number;
    systemGap?: number;
    staffGap?: number;
    lyricLineGap?: number;
    lyricFontSize?: number;
    titleFontSize?: number;
  };
  practice?: {
    speed?: number;
    metronome?: boolean;
    countIn?: boolean;
    follow?: boolean;
  };
  bookmarks?: { name: string; measure: number }[];
  id: string;
  title: string;
  subTitle?: string;
  artist?: string;
  album?: string;
  tempo: number;
  timeSignature: [number, number]; // e.g., [4, 4]
  tracks: TrackAST[];
}

export interface TrackAST {
  source?: Record<string, any>;
  additionalStaves?: { source?: Record<string, any>; measures: MeasureAST[] }[];
  id: string;
  name: string;
  type: "guitar" | "bass" | "piano" | "percussion";
  midiProgram: number; // General MIDI instrument ID
  isMuted: boolean;
  isSolo: boolean;
  volume: number; // 0.0 to 1.0
  pan: number; // -1.0 to 1.0
  tuning?: number[]; // MIDI pitch values per string (for guitar/bass)
  measures: MeasureAST[];
}

export interface MeasureAST {
  source?: Record<string, any>;
  masterSource?: Record<string, any>;
  tempo?: number;
  repeatStart?: boolean;
  repeatCount?: number;
  alternateEndings?: number;
  rehearsal?: string;
  index: number;
  timeSignature?: [number, number];
  keySignature?: string; // e.g., "C", "G#m"
  clef?: "treble" | "bass" | "alto" | "tenor" | "tab";
  voices: VoiceAST[];
}

export interface VoiceAST {
  source?: Record<string, any>;
  index: number; // 0 = Voice 1, 1 = Voice 2
  beats: BeatAST[];
}

export interface BeatAST {
  /** Empty voice spacers are not rests and must not affect pickup timing. */
  isEmpty?: boolean;
  /** Source durations that the duration palette cannot yet edit directly. */
  sourceDuration?: number;
  source?: Record<string, any>;
  tuplet?: [number, number];
  lyrics?: string[];
  /** MusicXML lyric semantics; text stays in lyrics for legacy projects. */
  lyricDetails?: {
    number?: string;
    syllabic?: "single" | "begin" | "middle" | "end";
    extend?: "start" | "continue" | "stop";
    placement?: "above" | "below";
    offsetX?: number;
    offsetY?: number;
  }[];
  stemDirection?: "up" | "down";
  text?: string;
  id: string;
  duration: "w" | "h" | "q" | "e" | "s" | "t" | "x" | "y"; // whole, half, quarter, eighth, sixteenth, thirty-second
  isDotted: boolean;
  isTuplet: boolean;
  notes: NoteAST[];
  dynamics?: "ppp" | "pp" | "p" | "mp" | "mf" | "f" | "ff" | "fff";
  chord?: { name: string; strings?: number[]; firstFret?: number };
  pedalEvent?: "down" | "up" | "change";
  playbackStart?: number; // Added for audio sync
  playbackEnd?: number; // Added for audio sync
}

export interface NoteAST {
  /** Stable application IDs for imported note relationships. */
  links?: Partial<Record<NoteLinkKey, string>>;
  source?: Record<string, any>;
  id: string;
  pitch: number; // Absolute MIDI note value (0 - 127)
  spelling?: { step: string; alter: number; octave: number; pitch: number };
  /** Original MIDI attack velocity, when imported from a MIDI performance. */
  velocity?: number;
  /** Explicit editor/XML attack override, independent of the beat's printed dynamic. */
  velocityOverride?: boolean;
  fret?: number; // String instrument fret
  string?: number; // String instrument string index (0-indexed)
  isTied: boolean;
  articulations?: {
    bend?: { points: { position: number; value: number }[] };
    palmMute?: boolean;
    letRing?: boolean;
    slide?: "into" | "out" | "legato";
    accent?: boolean;
    marcato?: boolean;
    tenuto?: boolean;
    staccato?: boolean;
  };
}

export type NoteLinkKey =
  | "tieoriginnoteid"
  | "tiedestinationnoteid"
  | "sluroriginnoteid"
  | "slurdestinationnoteid"
  | "hammerpulloriginnoteid"
  | "hammerpulldestinationnoteid"
  | "slideoriginnoteid"
  | "slidetargetnoteid";
