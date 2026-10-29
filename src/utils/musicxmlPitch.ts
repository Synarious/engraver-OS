const major = [
  "Cb",
  "Gb",
  "Db",
  "Ab",
  "Eb",
  "Bb",
  "F",
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
];
const minor = [
  "Ab",
  "Eb",
  "Bb",
  "F",
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
  "G#",
  "D#",
  "A#",
];
export function keySignature(name?: string, fifths = 0, mode = 0) {
  if (!name) return { fifths, mode };
  const isMinor = /m$/.test(name),
    root = name.replace(/m$/, "").replace(/♭/g, "b").replace(/♯/g, "#");
  const index = (isMinor ? minor : major).indexOf(root);
  if (index < 0) throw new Error(`Unsupported key signature: ${name}`);
  return { fifths: index - 7, mode: isMinor ? 1 : 0 };
}
export interface PitchSpelling {
  step: string;
  alter: number;
  octave: number;
  pitch: number;
}
export function spellPitch(
  pitch: number,
  fifths: number,
  accidental = 0,
  original?: PitchSpelling,
  modelPitch = pitch,
): PitchSpelling {
  const natural: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  if (
    accidental <= 1 &&
    original?.pitch === modelPitch &&
    Math.abs(
      (original.octave + 1) * 12 +
        natural[original.step] +
        original.alter -
        pitch,
    ) <= (Number.isInteger(original.alter) ? 0.001 : 0.5)
  )
    return original;
  const key = new Map<string, number>();
  (fifths > 0 ? "FCGDAEB" : "BEADGCF")
    .slice(0, Math.abs(fifths))
    .split("")
    .forEach((s) => key.set(s, fifths > 0 ? 1 : -1));
  const forced = ({ 2: 0, 3: 1, 4: 2, 5: -1, 6: -2 } as Record<number, number>)[
    accidental
  ];
  const candidates = Object.entries(natural)
    .flatMap(([step, pc]) =>
      [-1, 0, 1].map((o) => {
        const octave = Math.floor(pitch / 12) - 1 + o;
        return {
          step,
          octave,
          alter: pitch - (octave + 1) * 12 - pc,
          pitch: modelPitch,
        };
      }),
    )
    .filter((p) => Math.abs(p.alter) <= 2);
  return candidates.sort((a, b) => {
    const cost = (p: typeof a) =>
      (forced !== undefined && p.alter !== forced ? 100 : 0) +
      Math.abs(p.alter - (key.get(p.step) ?? 0)) * 3 +
      Math.abs(p.alter) +
      ((fifths < 0 && p.alter > 0) || (fifths >= 0 && p.alter < 0) ? 0.1 : 0);
    return cost(a) - cost(b);
  })[0];
}
