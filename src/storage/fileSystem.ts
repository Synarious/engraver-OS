import { openDB } from "idb";
import { ScoreAST } from "../types/score";
import { parseGuitarPro } from "../utils/alphaTabParser";
export interface LibraryDocument {
  id: string;
  title: string;
  kind: "pdf" | "image";
  original: Blob;
  filename: string;
  updatedAt: number;
  favorite?: boolean;
  tags?: string[];
  deletedAt?: number;
  rotation?: number;
  page?: number;
  annotations?: Annotation[];
  bookmarks?: { name: string; page: number }[];
  pageOrder?: number[];
  crop?: number;
  layers?: string[];
  view?: "single" | "spread" | "continuous";
  tapZones?: "edges" | "halves" | "off";
}
export interface Annotation {
  id: string;
  page: number;
  tool: "pen" | "highlight" | "text";
  color: string;
  points: { x: number; y: number }[];
  text?: string;
  layer?: string;
}
export interface Setlist {
  id: string;
  name: string;
  items: string[];
}
let database: ReturnType<typeof openDB> | undefined;
export function initDatabase() {
  database ??= openDB("BrowserNotationDB", 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("scores")) {
        const s = db.createObjectStore("scores", { keyPath: "id" });
        s.createIndex("updatedAt", "updatedAt");
      }
      for (const name of [
        "soundfonts",
        "revisions",
        "documents",
        "originals",
        "setlists",
      ])
        if (!db.objectStoreNames.contains(name))
          db.createObjectStore(name, {
            keyPath: name === "soundfonts" ? "name" : "id",
          });
    },
  });
  return database;
}
const browserGlobal =
  typeof window !== "undefined"
    ? (window as Window & { __engraverChannel?: BroadcastChannel })
    : undefined;
const channel =
  browserGlobal && typeof BroadcastChannel !== "undefined"
    ? (browserGlobal.__engraverChannel ??= new BroadcastChannel(
        "engraver-library",
      ))
    : null;
export function announce(id?: string) {
  channel?.postMessage({ id });
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("library-changed"));
}
if (channel)
  channel.onmessage = (event) =>
    window.dispatchEvent(
      new CustomEvent("library-remote-changed", { detail: event.data }),
    );
let queue = Promise.resolve();
export function saveScore(
  score: ScoreAST,
  original?: { filename: string; original: Blob },
) {
  // Snapshot synchronously: callers may supply an Immer draft, revoked after the action.
  const snapshot = JSON.parse(JSON.stringify(score)) as ScoreAST;
  snapshot.version = 1;
  snapshot.updatedAt = Date.now();
  const task = queue
    .catch(() => {})
    .then(async () => {
      window.dispatchEvent(
        new CustomEvent("score-save", {
          detail: { status: "saving", id: snapshot.id },
        }),
      );
      const db = await initDatabase();
      const tx = db.transaction(
        original
          ? ["scores", "revisions", "originals"]
          : ["scores", "revisions"],
        "readwrite",
      );
      try {
        const previous = await tx.objectStore("scores").get(snapshot.id);
        if (previous)
          await tx.objectStore("revisions").put({
            id: `${snapshot.id}:${crypto.randomUUID()}`,
            scoreId: snapshot.id,
            savedAt: Date.now(),
            score: previous,
          });
        await tx.objectStore("scores").put(snapshot);
        if (original)
          await tx
            .objectStore("originals")
            .put({ id: snapshot.id, ...original });
        await tx.done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* A failed transaction may already be aborted. */
        }
        void tx.done.catch(() => {});
        throw error;
      }
      const revisions = (await db.getAll("revisions"))
        .filter((r) => r.scoreId === snapshot.id)
        .sort((a, b) => b.savedAt - a.savedAt);
      for (const revision of revisions.slice(20))
        await db.delete("revisions", revision.id);
      announce(snapshot.id);
      window.dispatchEvent(
        new CustomEvent("score-save", {
          detail: { status: "saved", id: snapshot.id },
        }),
      );
    });
  queue = task;
  task.catch((error) =>
    window.dispatchEvent(
      new CustomEvent("score-save", {
        detail: {
          status: "error",
          id: snapshot.id,
          error: error instanceof Error ? error.message : String(error),
        },
      }),
    ),
  );
  return task;
}
export async function flushSaves() {
  await queue;
}
export async function listLibrary() {
  await flushSaves();
  const db = await initDatabase();
  return [
    ...(await db.getAll("scores")),
    ...(await db.getAll("documents")),
  ] as (ScoreAST | LibraryDocument)[];
}
export async function putDocument(document: LibraryDocument) {
  const db = await initDatabase();
  await db.put("documents", { ...document, updatedAt: Date.now() });
  announce(document.id);
}
export async function updateLibraryItem(item: ScoreAST | LibraryDocument) {
  if ("kind" in item) await putDocument(item);
  else await saveScore(item);
}
export function download(filename: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function saveScoreToLocalDisk(filename: string, data: Blob) {
  download(filename, data);
}
export function validateScore(value: unknown): asserts value is ScoreAST {
  const s = value as ScoreAST;
  if (
    !s ||
    typeof s.id !== "string" ||
    typeof s.title !== "string" ||
    !Array.isArray(s.tracks) ||
    !Number.isFinite(s.tempo) ||
    s.tempo <= 0 ||
    !Array.isArray(s.timeSignature) ||
    s.timeSignature.length !== 2 ||
    s.timeSignature.some((n) => !Number.isInteger(n) || n < 1)
  )
    throw new Error("Invalid score project.");
  if (s.version && s.version > 1)
    throw new Error("This project requires a newer version of Engraver.");
  const ids = new Set<string>();
  const id = (value: string) => {
    if (typeof value !== "string" || ids.has(value))
      throw new Error("Invalid or duplicate score identifier.");
    ids.add(value);
  };
  for (const t of s.tracks) {
    id(t.id);
    if (!Array.isArray(t.measures)) throw new Error("Invalid track.");
    for (const staff of [
      { measures: t.measures },
      ...(t.additionalStaves ?? []),
    ])
      for (const m of staff.measures) {
        if (!Array.isArray(m.voices)) throw new Error("Invalid measure.");
        for (const v of m.voices) {
          if (!Array.isArray(v.beats)) throw new Error("Invalid voice.");
          for (const b of v.beats) {
            id(b.id);
            if (
              !["w", "h", "q", "e", "s", "t", "x", "y"].includes(b.duration) ||
              !Array.isArray(b.notes)
            )
              throw new Error("Invalid beat.");
            for (const n of b.notes) {
              id(n.id);
              if (!Number.isFinite(n.pitch) || n.pitch < 0 || n.pitch > 127)
                throw new Error("Invalid pitch.");
            }
          }
        }
      }
  }
}
export async function importFile(
  file: File,
): Promise<ScoreAST | LibraryDocument> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (
    extension === "pdf" ||
    ["png", "jpg", "jpeg", "webp"].includes(extension ?? "")
  ) {
    const item: LibraryDocument = {
      id: crypto.randomUUID(),
      title: file.name.replace(/\.[^.]+$/, ""),
      filename: file.name,
      original: file,
      kind: extension === "pdf" ? "pdf" : "image",
      updatedAt: Date.now(),
      annotations: [],
      bookmarks: [],
    };
    await putDocument(item);
    return item;
  }
  let score: ScoreAST;
  if (extension === "json") {
    score = JSON.parse(await file.text());
    validateScore(score);
    score = { ...score, id: crypto.randomUUID() };
  } else if (extension === "mid" || extension === "midi") {
    const { parseMidi } = await import("../utils/midi");
    score = parseMidi(await file.arrayBuffer(), file.name);
  } else if (
    ["gp", "gpx", "gp3", "gp4", "gp5", "xml", "musicxml", "mxl"].includes(
      extension ?? "",
    )
  )
    score = parseGuitarPro(await file.arrayBuffer());
  else
    throw new Error(
      "Choose Guitar Pro, MusicXML/MXL, MIDI, PDF, an image, or an Engraver JSON project.",
    );
  validateScore(score);
  await saveScore(score, { filename: file.name, original: file });
  return score;
}
export async function openLocalScoreFile() {
  const file = await new Promise<File>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      ".gp,.gpx,.gp3,.gp4,.gp5,.xml,.musicxml,.mxl,.mid,.midi,.json";
    input.onchange = () =>
      input.files?.[0]
        ? resolve(input.files[0])
        : reject(new Error("No file selected"));
    input.oncancel = () => reject(new Error("Cancelled"));
    input.click();
  });
  const score = await importFile(file);
  if ("kind" in score) throw new Error("Choose an editable score.");
  return { name: file.name, content: await file.arrayBuffer(), score };
}
async function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
export async function backupLibrary() {
  await flushSaves();
  const db = await initDatabase();
  const result: any = {
    format: "engraver-library",
    version: 1,
    createdAt: Date.now(),
  };
  for (const name of [
    "scores",
    "documents",
    "originals",
    "setlists",
    "revisions",
  ]) {
    result[name] = await Promise.all(
      (await db.getAll(name)).map(async (item) =>
        item.original
          ? { ...item, original: await blobToBase64(item.original) }
          : item,
      ),
    );
  }
  download(
    "engraver-library.json",
    new Blob([JSON.stringify(result)], { type: "application/json" }),
  );
}
export async function restoreLibrary(file: File) {
  const data = JSON.parse(await file.text());
  if (data.format !== "engraver-library" || data.version !== 1)
    throw new Error("Unsupported library backup.");
  for (const s of data.scores ?? []) validateScore(s);
  const decoded: Record<string, any[]> = {};
  for (const name of [
    "scores",
    "documents",
    "originals",
    "setlists",
    "revisions",
  ]) {
    if (!Array.isArray(data[name]))
      throw new Error(`Missing backup collection: ${name}`);
    decoded[name] = await Promise.all(
      data[name].map(async (item: any) => {
        if (typeof item.id !== "string")
          throw new Error("Invalid backup entry");
        if (item.original) {
          if (
            typeof item.original !== "string" ||
            !/^data:[^,]*;base64,/.test(item.original)
          )
            throw new Error("Invalid embedded original");
          item = {
            ...item,
            original: await (await fetch(item.original)).blob(),
          };
        }
        return item;
      }),
    );
  }
  const db = await initDatabase();
  const tx = db.transaction(Object.keys(decoded), "readwrite");
  // Merge new entries; keep local entries when an ID already exists.
  for (const [name, items] of Object.entries(decoded))
    for (const item of items)
      if (!(await tx.objectStore(name).get(item.id)))
        await tx.objectStore(name).put(item);
  await tx.done;
  announce();
}
