import type { model } from "@coderline/alphatab";
import type { ScoreAST, BeatAST } from "../types/score";
import {
  elements as children,
  first as child,
  content as text,
  parseXML as parse,
  readMusicXML,
  serializeXML,
} from "./musicxmlDocument";
const number = (s: string | null): number | undefined =>
  s !== null && s.trim() !== "" && Number.isFinite(Number(s))
    ? Number(s)
    : undefined;
/** Read only supported partwise metadata; alphaTab remains the notation importer. */
export function importMusicXMLDetails(
  bytes: Uint8Array,
  score: ScoreAST,
  native: model.Score,
) {
  const source = readMusicXML(bytes);
  if (source === null) return;
  const document = parse(source),
    root = document.documentElement;
  if (root?.localName !== "score-partwise") return;
  score.source ??= {};
  score.source.musicxml = {
    defaults: child(root, "defaults")
      ? serializeXML(child(root, "defaults"))
      : undefined,
    credits: children(root, "credit")
      .filter((c) => !["title", "subtitle"].includes(text(c, "credit-type")))
      .map(serializeXML),
  };
  const warnings = new Set<string>();
  if (root.getElementsByTagName("cue").length)
    warnings.add(
      "Cue notes are retained for interchange; audition their playback before performing.",
    );
  for (const [tag, label] of [
    ["figured-bass", "figured bass"],
    ["harp-pedals", "harp pedal diagrams"],
    ["accordion-registration", "accordion registration"],
    ["scordatura", "scordatura diagrams"],
  ])
    if (root.getElementsByTagName(tag).length)
      warnings.add(
        `This file includes ${label}; review these specialized symbols against the retained original.`,
      );
  if (
    root.getElementsByTagName("alter").length &&
    Array.from(root.getElementsByTagName("alter")).some(
      (n: any) => !Number.isInteger(Number(n.textContent)),
    )
  )
    warnings.add(
      "Microtonal spelling is retained, but playback uses semitone pitches.",
    );
  const defaults = child(root, "defaults"),
    system = child(defaults, "system-layout");
  const systemGap = number(text(system, "system-distance"));
  const staffGap = number(
    text(child(defaults, "staff-layout"), "staff-distance"),
  );
  if (systemGap !== undefined || staffGap !== undefined)
    score.engraving = {
      ...score.engraving,
      ...(systemGap !== undefined
        ? { systemGap: Math.max(0, Math.min(200, systemGap)) }
        : {}),
      ...(staffGap !== undefined
        ? { staffGap: Math.max(0, Math.min(120, staffGap)) }
        : {}),
    };
  const lyricSize = number(
    child(defaults, "lyric-font")?.getAttribute("font-size") ?? null,
  );
  const titleCredit = children(root, "credit").find(
    (c) => text(c, "credit-type") === "title",
  );
  const titleSize = number(
    child(titleCredit, "credit-words")?.getAttribute("font-size") ?? null,
  );
  if (lyricSize !== undefined || titleSize !== undefined)
    score.engraving = {
      ...score.engraving,
      ...(lyricSize !== undefined
        ? { lyricFontSize: Math.max(8, Math.min(64, lyricSize / 0.75)) }
        : {}),
      ...(titleSize !== undefined
        ? { titleFontSize: Math.max(8, Math.min(64, titleSize / 0.75)) }
        : {}),
    };
  children(root, "part").forEach((part, ti) => {
    const track = score.tracks[ti],
      nt = native.tracks[ti];
    if (!track || !nt) return;
    let divisions = 1;
    const noteCounters = new Map<string, number>();
    const verseIndices = new Map<string, number>();
    const connections: {
      note: import("../types/score").NoteAST;
      family: string;
      number: string;
      type: string;
      si: number;
      vi: number;
      tick: number;
    }[] = [];
    const systemStarts: number[] = [];
    const harmonies: { xml: any; mi: number; si: number; tick: number }[] = [];
    const pedalEvents: {
      si: number;
      mi: number;
      tick: number;
      type: number;
    }[] = [];
    children(part, "measure").forEach((measure, mi) => {
      const print = child(measure, "print");
      if (
        mi > 0 &&
        (print?.getAttribute("new-system") === "yes" ||
          print?.getAttribute("new-page") === "yes")
      )
        systemStarts.push(mi);
      for (const staff of [track, ...(track.additionalStaves ?? [])]) {
        const bar = staff.measures[mi];
        if (bar) {
          bar.source ??= {};
          bar.source.musicxml = {
            print: print ? serializeXML(print) : undefined,
            implicit: measure.getAttribute("implicit"),
            width: number(measure.getAttribute("width")),
          };
        }
      }
      let cursor = 0,
        previous = 0;
      for (const element of children(measure)) {
        if (element.localName === "attributes")
          divisions = number(text(element, "divisions")) || divisions;
        if (element.localName === "backup")
          cursor -= (Number(text(element, "duration")) * 960) / divisions;
        if (element.localName === "forward")
          cursor += (Number(text(element, "duration")) * 960) / divisions;
        if (element.localName === "harmony")
          harmonies.push({
            xml: element,
            mi,
            si: Math.max(0, Number(text(element, "staff") || 1) - 1),
            tick:
              cursor + (Number(text(element, "offset") || 0) * 960) / divisions,
          });
        if (element.localName === "direction") {
          const type = child(element, "direction-type"),
            pedal = child(type, "pedal");
          if (pedal) {
            const pedalType = (
              {
                start: 0,
                resume: 0,
                change: 1,
                stop: 2,
                discontinue: 2,
              } as Record<string, number>
            )[pedal.getAttribute("type")];
            if (pedalType !== undefined)
              pedalEvents.push({
                si: Math.max(0, Number(text(element, "staff") || 1) - 1),
                mi,
                tick: cursor + Number(text(element, "offset") || 0),
                type: pedalType,
              });
          }
          const words = text(type, "words").replace(/\s+/g, " ").trim();
          const codes: Record<string, number> = {
            "D.C.": 5,
            "D.C. al Coda": 6,
            "D.C. al Double Coda": 7,
            "D.C. al Fine": 8,
            "D.S.": 9,
            "D.S. al Coda": 10,
            "D.S. al Double Coda": 11,
            "D.S. al Fine": 12,
            "D.S.S.": 13,
            "D.S.S. al Coda": 14,
            "D.S.S. al Double Coda": 15,
            "D.S.S. al Fine": 16,
            "To Coda": 17,
            "To Double Coda": 18,
          };
          const code = codes[words];
          if (code !== undefined)
            for (const staff of [track, ...(track.additionalStaves ?? [])]) {
              const bar = staff.measures[mi];
              if (bar) {
                bar.masterSource ??= {};
                bar.masterSource.directions = [
                  ...(bar.masterSource.directions ?? []).filter(
                    (v: number) => v < 5,
                  ),
                  code,
                ];
              }
            }
        }
        if (element.localName !== "note") continue;
        const chord = !!child(element, "chord"),
          onset = chord ? previous : cursor;
        if (!chord) {
          previous = cursor;
          cursor += (Number(text(element, "duration")) * 960) / divisions;
        }
        const si = Math.max(0, Number(text(element, "staff") || 1) - 1),
          vi = Math.max(0, Number(text(element, "voice") || 1) - 1);
        const voice = nt.staves[si]?.bars[mi]?.voices[vi];
        const bi =
          voice?.beats.findIndex(
            (b) =>
              Math.abs(b.displayStart - onset) < 1 &&
              (b.graceType !== 0) === !!child(element, "grace"),
          ) ?? -1;
        const beat = (si ? track.additionalStaves?.[si - 1] : track)?.measures[
          mi
        ]?.voices[vi]?.beats[bi];
        if (!beat) continue;
        const voiceModel = (si ? track.additionalStaves?.[si - 1] : track)
          ?.measures[mi]?.voices[vi];
        if (voiceModel) {
          voiceModel.source ??= {};
          voiceModel.source.musicxmlVoice =
            element.getAttribute("data-engraver-voice") || String(vi + 1);
        }
        beat.source ??= {};
        if (!chord) {
          beat.source.musicxml = {
            grace: child(element, "grace")
              ? serializeXML(child(element, "grace"))
              : undefined,
            cue: !!child(element, "cue"),
            tuplets: children(child(element, "notations"), "tuplet")
              .map(serializeXML)
              .join(""),
            timeModification: child(element, "time-modification")
              ? serializeXML(child(element, "time-modification"))
              : undefined,
            tupletSignature: JSON.stringify([
              beat.duration,
              beat.isDotted,
              beat.isTuplet,
              beat.tuplet,
            ]),
          };
        }
        const stem = text(element, "stem");
        if (stem === "up" || stem === "down") beat.stemDirection = stem;
        const lyrics = children(element, "lyric");
        if (lyrics.length) {
          beat.lyrics ??= [];
          beat.lyricDetails ??= [];
          lyrics.forEach((lyric, li) => {
            // alphaTab assigns verse lines in first-seen order, including named verses.
            const num = lyric.getAttribute("number") || String(li + 1);
            if (!verseIndices.has(num))
              verseIndices.set(num, verseIndices.size);
            const index = verseIndices.get(num)!;
            beat.lyrics![index] = children(lyric, "text")
              .map((t) => t.textContent)
              .join(" ")
              .trim();
            const syllabic = text(lyric, "syllabic"),
              extend = child(lyric, "extend"),
              placement = lyric.getAttribute("placement");
            beat.lyricDetails![index] = {
              number: num,
              syllabic: ["single", "begin", "middle", "end"].includes(syllabic)
                ? (syllabic as any)
                : undefined,
              extend: extend
                ? extend.getAttribute("type") || "start"
                : undefined,
              placement:
                placement === "above" || placement === "below"
                  ? placement
                  : undefined,
              offsetX: number(lyric.getAttribute("relative-x")),
              offsetY: number(lyric.getAttribute("relative-y")),
            };
            beat.source!.musicxml ??= {};
            beat.source!.musicxml.lyrics ??= [];
            beat.source!.musicxml.lyrics[index] = serializeXML(lyric);
          });
        }
        if (child(element, "rest")) continue;
        const pitch = child(element, "pitch");
        const noteIndex = noteCounters.get(beat.id) ?? 0;
        noteCounters.set(beat.id, noteIndex + 1);
        const note = beat.notes[noteIndex];
        if (!note) continue;
        if (pitch)
          note.spelling = {
            step: text(pitch, "step"),
            alter: Number(text(pitch, "alter") || 0),
            octave: Number(text(pitch, "octave")),
            pitch: note.pitch,
          };
        note.source ??= {};
        note.source.musicxml = {
          unpitched: child(element, "unpitched")
            ? serializeXML(child(element, "unpitched"))
            : undefined,
          notehead: child(element, "notehead")
            ? serializeXML(child(element, "notehead"))
            : undefined,
          accidental: child(element, "accidental")
            ? serializeXML(child(element, "accidental"))
            : undefined,
          attributes: Object.fromEntries(
            Array.from(element.attributes)
              .filter((a: any) =>
                [
                  "default-x",
                  "default-y",
                  "relative-x",
                  "relative-y",
                  "print-object",
                  "print-spacing",
                  "color",
                ].includes(a.name),
              )
              .map((a: any) => [a.name, a.value]),
          ),
        };
        const technical = child(child(element, "notations"), "technical");
        for (const marker of children(
          child(element, "notations"),
          "slur",
        ).concat(
          children(child(element, "notations"), "slide"),
          children(technical, "hammer-on"),
          children(technical, "pull-off"),
        )) {
          connections.push({
            note,
            family: ["hammer-on", "pull-off"].includes(marker.localName)
              ? "hammer"
              : marker.localName,
            number: marker.getAttribute("number") || "1",
            type: marker.getAttribute("type"),
            si,
            vi,
            tick: (native.masterBars[mi]?.start ?? 0) + onset,
          });
          if (["hammer-on", "pull-off"].includes(marker.localName))
            note.source.ishammerpullorigin =
              marker.getAttribute("type") === "start";
        }
        const harmonic = child(technical, "harmonic");
        if (harmonic) {
          note.source.harmonictype = child(harmonic, "natural") ? 1 : 2;
          note.source.harmonicvalue =
            note.fret && note.fret > 0 ? note.fret : 12;
        }
        for (const marker of children(technical, "other-technical")) {
          const value = marker.textContent?.toLowerCase() || "";
          if (value.includes("pinch harmonic")) note.source.harmonictype = 3;
          if (value.includes("tap harmonic")) note.source.harmonictype = 4;
          if (value.includes("semi harmonic")) note.source.harmonictype = 5;
          if (value.includes("feedback harmonic")) note.source.harmonictype = 6;
          if (value.includes("palm mute")) {
            note.articulations ??= {};
            note.articulations.palmMute = true;
          }
          if (value.includes("let ring")) {
            note.articulations ??= {};
            note.articulations.letRing = true;
          }
          if (value === "slap") beat.source!.slap = true;
          if (value === "pop") beat.source!.pop = true;
        }
        const velocity = number(element.getAttribute("dynamics"));
        if (velocity !== undefined) {
          note.velocity = Math.max(
            1,
            Math.min(127, Math.round((velocity * 90) / 100)),
          );
          note.velocityOverride = true;
        }
        const articulations = child(
          child(element, "notations"),
          "articulations",
        );
        if (articulations) {
          note.articulations ??= {};
          note.articulations.marcato = !!child(articulations, "strong-accent");
          note.articulations.tenuto = !!child(articulations, "tenuto");
        }
      }
    });
    for (const h of harmonies) {
      const bar = (h.si ? track.additionalStaves?.[h.si - 1] : track)?.measures[
          h.mi
        ],
        nb = native.tracks[ti]?.staves[h.si]?.bars[h.mi];
      if (!bar || !nb) continue;
      let target: BeatAST | undefined;
      for (let vi = 0; vi < nb.voices.length; vi++) {
        const bi = nb.voices[vi].beats.findIndex(
          (b) => Math.abs(b.displayStart - h.tick) < 1,
        );
        const b = bar.voices[vi]?.beats[bi];
        if (b && (!target || b.chord)) target = b;
      }
      if (!target) continue;
      const root = child(h.xml, "root"),
        bass = child(h.xml, "bass"),
        kind = child(h.xml, "kind");
      const accidental = (n: number) =>
        n < 0 ? "b".repeat(-n) : "#".repeat(n);
      const rootName =
        text(root, "root-step") +
        accidental(Number(text(root, "root-alter") || 0));
      const suffix =
        kind?.getAttribute("text") ||
        (
          {
            major: "",
            minor: "m",
            dominant: "7",
            "major-seventh": "maj7",
            "minor-seventh": "m7",
            diminished: "dim",
            augmented: "aug",
            "suspended-second": "sus2",
            "suspended-fourth": "sus4",
            "half-diminished": "m7b5",
          } as Record<string, string>
        )[kind?.textContent] ||
        "";
      const bassName = bass
        ? "/" +
          text(bass, "bass-step") +
          accidental(Number(text(bass, "bass-alter") || 0))
        : "";
      const name =
        kind?.textContent === "none"
          ? kind.getAttribute("text") || "N.C."
          : root
            ? rootName + suffix + bassName
            : text(h.xml, "function") || target.chord?.name || "";
      target.chord = { ...target.chord, name };
      target.source ??= {};
      target.source.musicxml ??= {};
      target.source.musicxml.harmony = serializeXML(h.xml);
      target.source.musicxml.harmonyName = name;
      target.source.musicxml.harmonyChord = JSON.parse(
        JSON.stringify(target.chord),
      );
    }
    for (const e of pedalEvents) {
      const bar = (e.si ? track.additionalStaves?.[e.si - 1] : track)?.measures[
        e.mi
      ];
      if (!bar) continue;
      bar.source ??= {};
      // Replace native markers with the complete standard sequence, including
      // pedal-up events whose pedal-down was in an earlier measure.
      bar.source.sustainpedals = pedalEvents
        .filter((p) => p.mi === e.mi && p.si === e.si)
        .map((p) => ({
          pedaltype: p.type,
          ratioposition:
            p.tick / native.masterBars[p.mi].calculateDuration(false),
        }));
    }
    const keys = {
      slur: ["sluroriginnoteid", "slurdestinationnoteid"],
      slide: ["slideoriginnoteid", "slidetargetnoteid"],
      hammer: ["hammerpulloriginnoteid", "hammerpulldestinationnoteid"],
    } as const;
    const used = new Set<object>();
    for (const start of connections
      .filter((e) => e.type === "start")
      .sort((a, b) => a.tick - b.tick)) {
      const stop = connections
        .filter(
          (e) =>
            e.type === "stop" &&
            e.family === start.family &&
            e.number === start.number &&
            e.tick >= start.tick &&
            !used.has(e),
        )
        .sort((a, b) => {
          const scope = (e: typeof a) =>
            e.si === start.si ? (e.vi === start.vi ? 0 : 1) : 2;
          return a.tick - b.tick || scope(a) - scope(b);
        })[0];
      if (!stop) continue;
      used.add(stop);
      const pair = keys[start.family as keyof typeof keys];
      if (!pair) continue;
      start.note.links ??= {};
      stop.note.links ??= {};
      start.note.links[pair[1]] = stop.note.id;
      stop.note.links[pair[0]] = start.note.id;
      if (start.family === "slur") {
        stop.note.source ??= {};
        stop.note.source.isslurdestination = true;
      }
      if (start.family === "slide") {
        start.note.source ??= {};
        start.note.source.slideouttype = 2;
        start.note.articulations ??= {};
        start.note.articulations.slide = "legato";
      }
      if (start.family === "hammer") {
        start.note.source ??= {};
        start.note.source.ishammerpullorigin = true;
      }
    }
    if (systemStarts.length) {
      const ends = [0, ...systemStarts, track.measures.length];
      const counts = ends.slice(1).map((end, i) => end - ends[i]);
      track.source = { ...track.source, systemslayout: counts };
      if (ti === 0) score.source = { ...score.source, systemslayout: counts };
    }
  });
  score.source!.musicxml.importedEngraving = { ...score.engraving };
  score.interchange = { warnings: [...warnings] };
}

export function lyricXML(beat: BeatAST, escape: (s: unknown) => string) {
  return Array.from(
    {
      length: Math.max(
        beat.lyrics?.length ?? 0,
        beat.lyricDetails?.length ?? 0,
      ),
    },
    (_, i) => {
      const d = beat.lyricDetails?.[i],
        value = beat.lyrics?.[i] ?? "";
      if (!value && !d?.extend) return "";
      const saved = beat.source?.musicxml?.lyrics?.[i];
      if (saved) {
        const doc = parse(saved),
          root = doc.documentElement!;
        root.setAttribute("number", d?.number ?? String(i + 1));
        if (d?.placement) root.setAttribute("placement", d.placement);
        if (d?.offsetX !== undefined)
          root.setAttribute("relative-x", String(d.offsetX));
        if (d?.offsetY !== undefined)
          root.setAttribute("relative-y", String(d.offsetY));
        const originalText = children(root, "text")
          .map((t) => t.textContent)
          .join(" ")
          .trim();
        if (value !== originalText) {
          for (const n of children(root).filter((n) =>
            ["text", "syllabic", "elision"].includes(n.localName),
          ))
            root.removeChild(n);
          if (value) {
            const t = doc.createElement("text");
            t.textContent = value;
            root.insertBefore(t, root.firstChild);
          }
        }
        let syllabic = child(root, "syllabic");
        if (value && d?.syllabic) {
          if (!syllabic) {
            syllabic = doc.createElement("syllabic");
            root.insertBefore(syllabic, root.firstChild);
          }
          syllabic.textContent = d.syllabic;
        }
        let extension = child(root, "extend");
        if (d?.extend) {
          if (!extension) {
            extension = doc.createElement("extend");
            root.insertBefore(
              extension,
              child(root, "end-line") ?? child(root, "end-paragraph") ?? null,
            );
          }
          extension.setAttribute("type", d.extend);
        } else if (extension) root.removeChild(extension);
        return serializeXML(root);
      }
      return `<lyric number="${escape(d?.number ?? String(i + 1))}"${d?.placement ? ` placement="${escape(d.placement)}"` : ""}${d?.offsetX !== undefined ? ` relative-x="${escape(d.offsetX)}"` : ""}${d?.offsetY !== undefined ? ` relative-y="${escape(d.offsetY)}"` : ""}>${value ? `${d?.syllabic ? `<syllabic>${escape(d.syllabic)}</syllabic>` : ""}<text>${escape(value)}</text>` : ""}${d?.extend ? `<extend type="${escape(d.extend)}"/>` : ""}</lyric>`;
    },
  ).join("");
}
