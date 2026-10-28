import { blankScore } from "./project";
import { parseMidi } from "./midi";
import type { ScoreAST } from "../types/score";

export type ExampleId =
  "czerny" | "greensleeves" | "drums" | "chopin-4" | "chopin-15" | "chopin-20";
export const examples: {
  id: ExampleId;
  title: string;
  instrument: string;
  description: string;
}[] = [
  {
    id: "czerny",
    title: "Eight-Measure Exercise No. 1",
    instrument: "Acoustic grand piano",
    description: "Carl Czerny · public-domain Mutopia MIDI",
  },
  {
    id: "greensleeves",
    title: "Greensleaves",
    instrument: "Acoustic nylon guitar",
    description: "Traditional · public-domain Mutopia MIDI",
  },
  {
    id: "chopin-4",
    title: "Prelude in E minor, Op. 28 No. 4",
    instrument: "Acoustic grand piano · both hands",
    description: "Frédéric Chopin · public-domain Mutopia MIDI",
  },
  {
    id: "chopin-15",
    title: "Raindrop Prelude, Op. 28 No. 15",
    instrument: "Acoustic grand piano · both hands",
    description: "Frédéric Chopin · public-domain Mutopia MIDI",
  },
  {
    id: "chopin-20",
    title: "Prelude in C minor, Op. 28 No. 20",
    instrument: "Acoustic grand piano · both hands",
    description: "Frédéric Chopin · public-domain Mutopia MIDI",
  },
  {
    id: "drums",
    title: "Drum Kit Groove",
    instrument: "Standard drum kit",
    description: "Original four-bar practice pattern",
  },
];

export function makeExample(id: ExampleId, bytes?: ArrayBuffer): ScoreAST {
  if (id === "drums") {
    const score = blankScore("Drum Kit Groove", "percussion", 4);
    score.artist = "Engraver";
    score.tempo = 100;
    const track = score.tracks[0];
    track.name = "Standard drum kit";
    track.measures.forEach((measure, bar) => {
      measure.voices[0].beats = Array.from({ length: 8 }, (_, step) => ({
        id: crypto.randomUUID(),
        duration: "e",
        isDotted: false,
        isTuplet: false,
        notes: [
          42,
          ...(step === 0 || step === 4 || (bar === 3 && step === 6)
            ? [36]
            : []),
          ...(step === 2 || step === 6 ? [38] : []),
        ].map((pitch) => ({ id: crypto.randomUUID(), pitch, isTied: false })),
      }));
    });
    return score;
  }
  if (!bytes) throw new Error("Example MIDI could not be loaded.");
  const score = parseMidi(bytes, id);
  const piano = id !== "greensleeves";
  score.title = examples.find((example) => example.id === id)!.title;
  score.artist = id.startsWith("chopin-")
    ? "Frédéric Chopin"
    : id === "czerny"
      ? "Carl Czerny"
      : "Traditional";
  score.subTitle = "MIDI transcription · quantized to sixteenths";
  score.tracks.forEach((track, index) => {
    track.type = piano ? "piano" : "guitar";
    track.midiProgram = piano ? 0 : 24;
    track.name = piano
      ? index === 0
        ? "Piano · upper"
        : "Piano · lower"
      : "Acoustic nylon guitar";
  });
  if (piano && score.tracks.length === 2) {
    const [upper, lower] = score.tracks;
    upper.name = "Piano";
    upper.measures.forEach((measure) => {
      measure.clef = "treble";
    });
    lower.measures.forEach((measure) => {
      measure.clef = "bass";
    });
    upper.additionalStaves = [{ measures: lower.measures }];
    score.tracks = [upper];
  }
  return score;
}
export const exampleFiles: Partial<Record<ExampleId, string>> = {
  czerny: "/examples/czerny-op821-1.mid",
  greensleeves: "/examples/greensleaves.mid",
  "chopin-4": "/examples/chopin-op28-4.mid",
  "chopin-15": "/examples/chopin-op28-15.mid",
  "chopin-20": "/examples/chopin-op28-20.mid",
};

export async function loadExample(id: ExampleId) {
  const path = exampleFiles[id];
  let original: Blob | undefined;
  if (path) {
    const response = await fetch(path);
    if (!response.ok)
      throw new Error(
        "Unable to load the example. Check your connection and try again.",
      );
    original = await response.blob();
  }
  return {
    score: makeExample(id, original ? await original.arrayBuffer() : undefined),
    original:
      original && path
        ? { filename: path.split("/").pop()!, original }
        : undefined,
  };
}
