import { NoteAST, NoteLinkKey } from "../types/score";

export const noteLinkPairs: [NoteLinkKey, NoteLinkKey][] = [
  ["tieoriginnoteid", "tiedestinationnoteid"],
  ["sluroriginnoteid", "slurdestinationnoteid"],
  ["hammerpulloriginnoteid", "hammerpulldestinationnoteid"],
  ["slideoriginnoteid", "slidetargetnoteid"],
];
export const noteLinkKeys = noteLinkPairs.flat();

/** Also migrates projects saved before stable note relationships were recorded. */
export function resolveNoteLinks(notes: NoteAST[]) {
  const originals = new Map<number, { note: NoteAST; index: number }[]>();
  notes.forEach((note, index) => {
    if (typeof note.source?.id !== "number") return;
    const candidates = originals.get(note.source.id) ?? [];
    candidates.push({ note, index });
    originals.set(note.source.id, candidates);
  });
  return new Map(
    notes.map((note, index) => {
      if (note.links) return [note.id, { ...note.links }];
      const links: NoteAST["links"] = {};
      for (const key of noteLinkKeys) {
        const candidates = originals.get(note.source?.[key]) ?? [];
        // Old pasted passages can contain repeated source IDs. Prefer the closest
        // origin before/destination after this note, rather than another passage.
        const origin = key.includes("origin");
        const directed = candidates.filter((c) =>
          origin ? c.index < index : c.index > index,
        );
        const target = [...directed].sort(
          (a, b) => Math.abs(a.index - index) - Math.abs(b.index - index),
        )[0];
        if (target) links[key] = target.note.id;
      }
      return [note.id, links];
    }),
  );
}

/** Read only application objects; source JSON is a separate, immutable archive. */
export function collectNotes(value: unknown): NoteAST[] {
  const notes: NoteAST[] = [];
  const walk = (entry: any) => {
    if (!entry || typeof entry !== "object") return;
    if (
      typeof entry.id === "string" &&
      typeof entry.pitch === "number" &&
      "isTied" in entry
    ) {
      notes.push(entry);
      return;
    }
    for (const [key, child] of Object.entries(entry))
      if (key !== "source" && key !== "masterSource") walk(child);
  };
  walk(value);
  return notes;
}

export function remapRendererNotes(entries: { model: NoteAST; raw: any }[]) {
  const links = resolveNoteLinks(entries.map((e) => e.model));
  const byId = new Map(
    entries.map((entry, index) => {
      entry.raw.id = index;
      for (const key of noteLinkKeys) delete entry.raw[key];
      // A copied/removed relationship must not leave a dangling source flag.
      if (entry.model.source?.sluroriginnoteid !== undefined)
        entry.raw.isslurdestination = false;
      return [entry.model.id, entry];
    }),
  );
  // Construct reciprocal relationships as one edge. Never emit an origin lookup
  // without registering its destination on the other note.
  for (const destination of entries) {
    for (const [originKey, destinationKey] of noteLinkPairs) {
      const originId = links.get(destination.model.id)?.[originKey];
      const origin = originId ? byId.get(originId) : undefined;
      if (!origin || origin.raw.id >= destination.raw.id) continue;
      if (originKey === "tieoriginnoteid" && !destination.model.isTied)
        continue;
      if (
        originKey === "sluroriginnoteid" &&
        destination.model.source?.isslurdestination === false
      )
        continue;
      if (
        originKey === "hammerpulloriginnoteid" &&
        origin.model.source?.ishammerpullorigin === false
      )
        continue;
      if (
        originKey === "slideoriginnoteid" &&
        !origin.model.articulations?.slide
      )
        continue;
      destination.raw[originKey] = origin.raw.id;
      origin.raw[destinationKey] = destination.raw.id;
      if (originKey === "sluroriginnoteid")
        destination.raw.isslurdestination = true;
    }
  }
}
