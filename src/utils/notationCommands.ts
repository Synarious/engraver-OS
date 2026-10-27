import { ScoreAST, BeatAST, NoteAST } from "../types/score";
import { scoreBeats } from "./scoreSelection";
import { setBeatDuration } from "./project";
import { collectNotes, resolveNoteLinks } from "./noteLinks";
export interface NotationCommand {
  id: string;
  label: string;
  glyph?: number;
  text?: string;
  scope: "note" | "beat" | "measure" | "relation" | "rest";
  values?: Record<string, unknown>;
  relation?: "slur" | "hammer" | "slide";
  duration?: BeatAST["duration"];
}
const note = (
  id: string,
  label: string,
  glyph: number | undefined,
  values: Record<string, unknown>,
  text?: string,
): NotationCommand => ({ id, label, glyph, scope: "note", values, text });
const beat = (
  id: string,
  label: string,
  glyph: number | undefined,
  values: Record<string, unknown>,
  text?: string,
): NotationCommand => ({ id, label, glyph, scope: "beat", values, text });
export const notationGroups: { name: string; commands: NotationCommand[] }[] = [
  {
    name: "Accidentals",
    commands: [
      note("natural", "Natural spelling", 57953, { accidentalmode: 2 }),
      note("sharp", "Sharp spelling", 57954, { accidentalmode: 3 }),
      note("flat", "Flat spelling", 57952, { accidentalmode: 5 }),
      note("double-sharp", "Double sharp spelling", 57955, {
        accidentalmode: 4,
      }),
      note("double-flat", "Double flat spelling", 57956, { accidentalmode: 6 }),
      note(
        "auto-accidental",
        "Automatic accidentals",
        undefined,
        { accidentalmode: 0 },
        "auto",
      ),
    ],
  },
  {
    name: "Rests",
    commands: (
      [
        ["w", "Whole", 58595],
        ["h", "Half", 58596],
        ["q", "Quarter", 58597],
        ["e", "Eighth", 58598],
        ["s", "16th", 58599],
        ["t", "32nd", 58600],
        ["x", "64th", 58601],
        ["y", "128th", 58602],
      ] as const
    ).map(([duration, label, glyph]) => ({
      id: `rest-${duration}`,
      label: `${label} rest`,
      glyph,
      scope: "rest",
      duration,
    })),
  },
  {
    name: "Articulation",
    commands: [
      note("tenuto", "Tenuto", 58532, { accentuated: 3 }),
      note("marcato", "Marcato", 58540, { accentuated: 2 }),
      note("ghost", "Ghost note", undefined, { isghost: true }, "(♩)"),
      note("dead", "Dead note", undefined, { isdead: true }, "×"),
      beat("grace-before", "Before-beat grace note", 58724, { gracetype: 2 }),
      beat("grace-on", "On-beat grace note", 58724, { gracetype: 1 }),
      {
        id: "slur",
        label: "Slur to selected or next note",
        text: "⌒",
        scope: "relation",
        relation: "slur",
      },
    ],
  },
  {
    name: "Guitar",
    commands: [
      {
        id: "hammer",
        label: "Hammer-on / pull-off to selected or next note",
        text: "H/P",
        scope: "relation",
        relation: "hammer",
      },
      {
        id: "slide",
        label: "Legato slide to selected or next note",
        text: "／",
        scope: "relation",
        relation: "slide",
      },
      note(
        "slide-in-low",
        "Slide in from below",
        undefined,
        { slideintype: 1 },
        "↗",
      ),
      note(
        "slide-in-high",
        "Slide in from above",
        undefined,
        { slideintype: 2 },
        "↘",
      ),
      note("slide-out-up", "Slide out up", undefined, { slideouttype: 3 }, "/"),
      note(
        "slide-out-down",
        "Slide out down",
        undefined,
        { slideouttype: 4 },
        "\\",
      ),
      note(
        "bend-half",
        "Half-step bend",
        undefined,
        {
          bendtype: 1,
          bendpoints: [
            { offset: 0, value: 0 },
            { offset: 60, value: 2 },
          ],
        },
        "½↗",
      ),
      note(
        "bend-full",
        "Whole-step bend",
        undefined,
        {
          bendtype: 1,
          bendpoints: [
            { offset: 0, value: 0 },
            { offset: 60, value: 4 },
          ],
        },
        "1↗",
      ),
      note("vibrato", "Vibrato", undefined, { vibrato: 1 }, "∿"),
      note("wide-vibrato", "Wide vibrato", undefined, { vibrato: 2 }, "∿∿"),
      note(
        "natural-harmonic",
        "Natural harmonic",
        undefined,
        { harmonictype: 1, harmonicvalue: 12 },
        "◇",
      ),
      note(
        "artificial-harmonic",
        "Artificial harmonic",
        undefined,
        { harmonictype: 2, harmonicvalue: 12 },
        "A.H.",
      ),
      note(
        "pinch-harmonic",
        "Pinch harmonic",
        undefined,
        { harmonictype: 3, harmonicvalue: 12 },
        "P.H.",
      ),
      beat("tap", "Tap", undefined, { tap: true }, "T"),
      beat("slap", "Slap", undefined, { slap: true }, "S"),
      beat("pop", "Pop", undefined, { pop: true }, "P"),
    ],
  },
  {
    name: "Ornaments",
    commands: [
      note("trill", "Trill a whole step above", 58726, { trillspeed: 32 }),
      note("turn", "Turn", 58727, { ornament: 2 }),
      note("inverted-turn", "Inverted turn", 58728, { ornament: 1 }),
      note("upper-mordent", "Upper mordent", 58732, { ornament: 3 }),
      note("lower-mordent", "Lower mordent", 58733, { ornament: 4 }),
      beat("tremolo-8", "Eighth-note tremolo", 57888, {
        tremolopicking: { marks: 1, style: 0 },
      }),
      beat("tremolo-16", "16th-note tremolo", 57889, {
        tremolopicking: { marks: 2, style: 0 },
      }),
      beat("tremolo-32", "32nd-note tremolo", 57890, {
        tremolopicking: { marks: 3, style: 0 },
      }),
    ],
  },
  {
    name: "Picking",
    commands: [
      beat("pick-up", "Upstroke", 58898, { pickstroke: 1 }),
      beat("pick-down", "Downstroke", 58896, { pickstroke: 2 }),
      beat(
        "arpeggio-up",
        "Arpeggio up",
        undefined,
        { brushtype: 3, brushduration: 60 },
        "∿↑",
      ),
      beat(
        "arpeggio-down",
        "Arpeggio down",
        undefined,
        { brushtype: 4, brushduration: 60 },
        "∿↓",
      ),
    ],
  },
  {
    name: "Fingering",
    commands: [
      ...[0, 1, 2, 3, 4].map((f) =>
        note(
          `finger-${f}`,
          `Left-hand finger ${f === 0 ? "thumb" : f}`,
          60688 + f,
          { lefthandfinger: f },
        ),
      ),
      ...[
        ["p", 0, 60695],
        ["i", 1, 60697],
        ["m", 2, 60698],
        ["a", 3, 60699],
      ].map(([name, f, glyph]) =>
        note(`right-${name}`, `Right-hand finger ${name}`, Number(glyph), {
          righthandfinger: f,
        }),
      ),
    ],
  },
  {
    name: "Structure",
    commands: [
      {
        id: "repeat-start",
        label: "Repeat start",
        text: "𝄆",
        scope: "measure",
        values: { repeatStart: true },
      },
      {
        id: "repeat-end",
        label: "Repeat end (twice)",
        text: "𝄇",
        scope: "measure",
        values: { repeatCount: 2 },
      },
      {
        id: "ending-1",
        label: "First ending",
        text: "1.",
        scope: "measure",
        values: { alternateEndings: 1 },
      },
      {
        id: "ending-2",
        label: "Second ending",
        text: "2.",
        scope: "measure",
        values: { alternateEndings: 2 },
      },
    ],
  },
];
export const notationCommands = notationGroups.flatMap((g) => g.commands);
export function commandActive(
  command: NotationCommand,
  notes: NoteAST[],
  beats: BeatAST[],
  measure?: Record<string, any>,
) {
  if (command.id === "trill")
    return (
      notes.length > 0 &&
      notes.every(
        (n) =>
          typeof n.source?.trillvalue === "number" && n.source.trillvalue >= 0,
      )
    );
  if (command.scope === "relation") {
    const key =
      command.relation === "slur"
        ? "slurdestinationnoteid"
        : command.relation === "hammer"
          ? "hammerpulldestinationnoteid"
          : "slidetargetnoteid";
    return !!notes[0]?.links?.[key];
  }
  const targets =
    command.scope === "note"
      ? notes.map((n) => n.source ?? {})
      : command.scope === "beat"
        ? beats.map((b) => b.source ?? {})
        : command.scope === "measure" && measure
          ? [measure]
          : [];
  return (
    !!targets.length &&
    !!command.values &&
    targets.every((t) =>
      Object.entries(command.values!).every(
        ([k, v]) => JSON.stringify(t[k]) === JSON.stringify(v),
      ),
    )
  );
}
export function applyNotationCommand(
  score: ScoreAST,
  noteIds: string[],
  beatIds: string[],
  id: string,
) {
  const command = notationCommands.find((c) => c.id === id);
  if (!command) throw new Error("Unknown notation command.");
  const entries = scoreBeats(score),
    selected = entries.filter(
      (e) =>
        beatIds.includes(e.beat.id) ||
        e.beat.notes.some((n) => noteIds.includes(n.id)),
    ),
    notes = selected.flatMap((e) =>
      e.beat.notes.filter((n) => noteIds.includes(n.id)),
    ),
    beats = selected.map((e) => e.beat);
  if (!selected.length) throw new Error("Select a note or rest first.");
  if (command.scope === "relation") {
    const first = selected.find((e) =>
      e.beat.notes.some((n) => noteIds.includes(n.id)),
    );
    if (!first) throw new Error("Select a note first.");
    const lane = entries.filter(
      (e) =>
        e.location.trackId === first.location.trackId &&
        e.location.staffIndex === first.location.staffIndex &&
        e.location.voiceIndex === first.location.voiceIndex,
    );
    if (selected.some((e) => !lane.includes(e)))
      throw new Error("Connect notes in the same track, staff, and voice.");
    const origin = notes[0],
      sameString = (n: NoteAST) =>
        command.relation === "slur" || n.string === origin.string;
    const laterSelected = selected
      .slice(selected.indexOf(first) + 1)
      .flatMap((e) => e.beat.notes.filter((n) => noteIds.includes(n.id)))
      .filter(sameString);
    const destination = laterSelected.length
      ? laterSelected.at(-1)
      : lane
          .slice(lane.indexOf(first) + 1)
          .flatMap((e) => e.beat.notes)
          .find(sameString);
    if (!destination || destination === origin || !sameString(destination))
      throw new Error(
        "Select a later note in this voice (on the same string for guitar techniques).",
      );
    const pairs = {
      slur: ["sluroriginnoteid", "slurdestinationnoteid"],
      hammer: ["hammerpulloriginnoteid", "hammerpulldestinationnoteid"],
      slide: ["slideoriginnoteid", "slidetargetnoteid"],
    } as const;
    const [originKey, destinationKey] = pairs[command.relation!],
      all = collectNotes(score),
      links = resolveNoteLinks(all);
    all.forEach((n) => {
      n.links ??= links.get(n.id) ?? {};
    });
    const remove = destination.links?.[originKey] === origin.id;
    for (const n of all) {
      if (n.links?.[originKey] === origin.id) delete n.links[originKey];
      if (n.links?.[destinationKey] === destination.id)
        delete n.links[destinationKey];
    }
    if (!remove) {
      origin.links![destinationKey] = destination.id;
      destination.links![originKey] = origin.id;
    }
    if (command.relation === "slur") {
      destination.source ??= {};
      destination.source.isslurdestination = !remove;
    }
    if (command.relation === "hammer") {
      origin.source ??= {};
      origin.source.ishammerpullorigin = !remove;
    }
    if (command.relation === "slide") {
      origin.source ??= {};
      origin.source.slideouttype = remove ? 0 : 2;
      origin.articulations ??= {};
      origin.articulations.slide = remove ? undefined : "legato";
    }
    return;
  }
  if (command.scope === "rest") {
    beats.forEach((b) => {
      setBeatDuration(b, command.duration!);
      b.notes = [];
      b.isEmpty = false;
    });
    return;
  }
  if (command.scope === "measure") {
    const indexes = new Set(selected.map((e) => e.location.measureIndex)),
      remove = [...indexes].every((index) =>
        commandActive(command, notes, beats, score.tracks[0].measures[index]),
      );
    score.tracks.forEach((t) =>
      [t, ...(t.additionalStaves ?? [])].forEach((st) =>
        st.measures.forEach((m, i) => {
          if (indexes.has(i))
            Object.entries(command.values!).forEach(([k, v]) => {
              (m as any)[k] = remove ? (typeof v === "boolean" ? false : 0) : v;
            });
        }),
      ),
    );
    return;
  }
  if (command.scope === "note" && !notes.length)
    throw new Error("Select a pitched note for this technique.");
  const remove = commandActive(command, notes, beats);
  const targets = command.scope === "note" ? notes : beats;
  targets.forEach((target) => {
    target.source ??= {};
    Object.entries(command.values!).forEach(([k, v]) => {
      target.source![k] = remove
        ? ["lefthandfinger", "righthandfinger"].includes(k)
          ? -2
          : typeof v === "boolean"
            ? false
            : typeof v === "number"
              ? 0
              : Array.isArray(v)
                ? []
                : null
        : structuredClone(v);
    });
    if (command.id === "trill")
      target.source.trillvalue = remove
        ? -1
        : Math.min(127, (target as NoteAST).pitch + 2);
    if (["marcato", "tenuto"].includes(command.id)) {
      const n = target as NoteAST;
      n.articulations ??= {};
      n.articulations.accent = !remove;
    }
    if (command.id.startsWith("slide-out")) {
      const n = target as NoteAST;
      n.articulations ??= {};
      n.articulations.slide = remove ? undefined : "out";
    }
    if (command.id === "dead" && remove && (target as NoteAST).fret === -1) {
      const n = target as NoteAST;
      const tuning = selected.find((e) => e.beat.notes.includes(n))?.tuning;
      n.fret =
        tuning && n.string !== undefined
          ? Math.max(0, n.pitch - tuning[n.string])
          : undefined;
    }
  });
}
