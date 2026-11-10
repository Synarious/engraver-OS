export const roots = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
export const maxFret = 24;
export const guitarTuning = [64, 59, 55, 50, 45, 40];
export const pitchClass = (pitch: number) => ((pitch % 12) + 12) % 12;
export const rootLabel = (root: number) =>
  roots[root]?.replace("b", "♭").replace("#", "♯") ?? "";
export const chordTypes = [
  ["Major", "", [0, 4, 7]],
  ["Minor", "m", [0, 3, 7]],
  ["Power chord", "5", [0, 7]],
  ["Dominant seventh", "7", [0, 4, 7, 10]],
  ["Major seventh", "maj7", [0, 4, 7, 11]],
  ["Minor seventh", "m7", [0, 3, 7, 10]],
  ["Diminished", "dim", [0, 3, 6]],
  ["Half diminished", "m7b5", [0, 3, 6, 10]],
  ["Augmented", "aug", [0, 4, 8]],
  ["Suspended second", "sus2", [0, 2, 7]],
  ["Suspended fourth", "sus4", [0, 5, 7]],
  ["Major sixth", "6", [0, 4, 7, 9]],
  ["Minor sixth", "m6", [0, 3, 7, 9]],
  ["Diminished seventh", "dim7", [0, 3, 6, 9]],
] as const;

export const scales = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  "Natural minor": [0, 2, 3, 5, 7, 8, 10],
  "Harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  "Melodic minor (ascending)": [0, 2, 3, 5, 7, 9, 11],
  "Major pentatonic": [0, 2, 4, 7, 9],
  "Minor pentatonic": [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
  Chromatic: Array.from({ length: 12 }, (_, i) => i),
} satisfies Record<string, readonly number[]>;

export type ScaleName = keyof typeof scales;
export type ScaleDiagramData = {
  root: number;
  scale: ScaleName;
  /** Open MIDI pitches, in score string order (string 1 first). */
  tuning: number[];
  firstFret: number;
  lastFret: number;
};

export function isDiagramTuning(tuning: unknown): tuning is number[] {
  return (
    Array.isArray(tuning) &&
    tuning.length >= 3 &&
    tuning.length <= 10 &&
    tuning.every(
      (pitch) => Number.isInteger(pitch) && pitch >= 0 && pitch <= 127,
    )
  );
}

export function isScaleDiagram(value: unknown): value is ScaleDiagramData {
  const d = value as ScaleDiagramData | undefined;
  return (
    !!d &&
    Number.isInteger(d.root) &&
    d.root >= 0 &&
    d.root < roots.length &&
    typeof d.scale === "string" &&
    Object.hasOwn(scales, d.scale) &&
    isDiagramTuning(d.tuning) &&
    Number.isInteger(d.firstFret) &&
    Number.isInteger(d.lastFret) &&
    d.firstFret >= 0 &&
    d.firstFret <= d.lastFret &&
    d.lastFret <= maxFret
  );
}

export function resizeTuning(tuning: readonly number[], count: number) {
  const next = tuning.slice(0, count);
  while (next.length < count) next.push(Math.max(0, (next.at(-1) ?? 45) - 5));
  return next;
}

type Shape = {
  frets: number[];
  mask: number;
  fretted: number;
  played: number;
  bass: number;
  cost: number;
};
const bitCount = (mask: number) => mask.toString(2).replaceAll("0", "").length;

/** Search short hand positions across the neck, including open strings. */
export function chordVoicings(
  tuning: number[],
  root: number,
  intervals: readonly number[],
  firstFret = 0,
  lastFret = maxFret,
) {
  if (
    !isDiagramTuning(tuning) ||
    intervals.length > tuning.length ||
    !intervals.length
  )
    return [];
  const required = (1 << intervals.length) - 1;
  const found = new Map<
    string,
    { strings: number[]; firstFret: number; cost: number }
  >();
  for (
    let position = Math.max(1, firstFret);
    position <= Math.max(1, lastFret);
    position++
  ) {
    const windowEnd = Math.min(lastFret, position + 3);
    const options = tuning.map((open) =>
      [
        -1,
        ...(firstFret === 0 ? [0] : []),
        ...Array.from(
          { length: windowEnd - position + 1 },
          (_, i) => position + i,
        ),
      ]
        .map((fret) => ({
          fret,
          degree: intervals.indexOf(pitchClass(open + fret - root)),
        }))
        .filter(
          ({ fret, degree }) =>
            fret === -1 || (degree >= 0 && open + fret <= 127),
        ),
    );
    let candidates: Shape[] = [
      { frets: [], mask: 0, fretted: 0, played: 0, bass: Infinity, cost: 0 },
    ];
    for (const [index, stringOptions] of options.entries()) {
      const next: Shape[] = [];
      const remaining = options.length - index - 1;
      for (const shape of candidates)
        for (const { fret, degree } of stringOptions) {
          const mask = shape.mask | (fret < 0 ? 0 : 1 << degree);
          if (bitCount(required ^ mask) > remaining) continue;
          const fretted = shape.fretted + Number(fret > 0);
          const frets = [...shape.frets, fret];
          if (fretted > 4) {
            const positive = frets.filter((f) => f > 0);
            const lowest = Math.min(...positive);
            const from = frets.indexOf(lowest),
              to = frets.lastIndexOf(lowest);
            const barre = !frets.slice(from, to + 1).some((f) => f <= 0);
            if (!barre || positive.filter((f) => f > lowest).length > 3)
              continue;
          }
          const played = shape.played + Number(fret >= 0);
          const bass =
            fret < 0 ? shape.bass : Math.min(shape.bass, tuning[index] + fret);
          const cost =
            shape.cost +
            (fret > 0 ? 2 : 0) -
            Number(fret >= 0) +
            (fret < 0 ? 0 : fret * 0.05);
          next.push({ frets, mask, fretted, played, bass, cost });
        }
      candidates = next
        .sort((a, b) => bitCount(b.mask) - bitCount(a.mask) || a.cost - b.cost)
        .slice(0, 140);
    }
    for (const shape of candidates.slice(0, 18)) {
      const positions = shape.frets.filter((f) => f > 0);
      const low = positions.length ? Math.min(...positions) : 1;
      const high = positions.length ? Math.max(...positions) : 1;
      const cost =
        shape.cost +
        low * 0.3 +
        (high - low) * 0.8 +
        (pitchClass(shape.bass) === root ? 0 : 1.5) +
        (shape.fretted > 4 ? 3 : 0);
      found.set(shape.frets.join(","), {
        strings: shape.frets,
        firstFret: high <= 5 ? 1 : low,
        cost,
      });
    }
  }
  return [...found.values()].sort((a, b) => a.cost - b.cost).slice(0, 16);
}

export const pianoMajorFingerings: Record<number, readonly [string, string]> = {
  0: ["12312345", "54321321"],
  1: ["23123412", "32143213"],
  2: ["12312345", "54321321"],
  3: ["31234123", "32143213"],
  4: ["12312345", "54321321"],
  5: ["12341234", "54321321"],
  6: ["23412312", "43213214"],
  7: ["12312345", "54321321"],
  8: ["34123123", "32143213"],
  9: ["12312345", "54321321"],
  10: ["41231234", "32143213"],
  11: ["12312345", "43214321"],
};
