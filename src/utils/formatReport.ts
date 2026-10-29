import type { ScoreAST } from "../types/score";
export interface FormatReport {
  title: string;
  summary: string;
  preserves: string[];
  limitations: string[];
  recommendation: string;
}
export function fileFormat(filename: string) {
  const ext = filename.split(".").at(-1)?.toLowerCase() ?? "";
  return ["xml", "musicxml", "mxl"].includes(ext)
    ? "musicxml"
    : ["gp", "gpx", "gp3", "gp4", "gp5"].includes(ext)
      ? "gp"
      : ["mid", "midi"].includes(ext)
        ? "midi"
        : ["png", "jpg", "jpeg", "webp"].includes(ext)
          ? "image"
          : ext;
}
export function formatReport(
  format: string,
  operation: "import" | "export",
  score?: ScoreAST,
): FormatReport {
  const importing = operation === "import";
  const info: Record<string, Omit<FormatReport, "title"> & { name: string }> = {
    musicxml: {
      name: "MusicXML",
      summary: importing
        ? "Open editable notation from MusicXML or compressed MXL, including partwise and timewise scores."
        : "Share editable notation as MusicXML 4.0. Compressed MXL carries the same score in a smaller file.",
      preserves: [
        "Notes, voices, staves, keys, clefs, transposition, and instrument assignments",
        "Supported tempo changes, pedals, dynamics, repeats, navigation, slurs, chords, and techniques",
        "Lyric verses, syllables, extensions, and supported positioning metadata",
      ],
      limitations: [
        "Pages may reflow. The viewer places lyrics automatically even when the file specifies exact offsets.",
        "Playback uses synthesized instruments and eight velocity levels. A soundfont cannot reproduce every recorded tone or performance nuance.",
        "Specialized notation and detailed technique curves may need review in the destination app.",
      ],
      recommendation:
        "Keep an Engraver project for continued editing and retain the imported original for reference.",
    },
    gp: {
      name: "Guitar Pro",
      summary: importing
        ? "Open Guitar Pro 3–8 scores as editable music."
        : "Save a Guitar Pro 7+ .gp score for notation and tablature applications.",
      preserves: [
        "Supported notes, tracks, tuning, tablature, guitar techniques, and playback instructions",
      ],
      limitations: [
        "Guitar Pro and Engraver may lay out or play techniques differently.",
        "MusicXML-specific lyric syllable metadata, exact offsets, and page layout may not transfer.",
      ],
      recommendation:
        "Use MusicXML for notation interchange and an Engraver project to retain all editor settings.",
    },
    midi: {
      name: "MIDI",
      summary: importing
        ? "Convert a MIDI performance into editable notation."
        : "Save a synthesized performance for a sequencer or another MIDI player.",
      preserves: [
        "Supported pitches, instruments, note attacks, timing, and tempo events",
      ],
      limitations: importing
        ? [
            "Import quantizes timing to sixteenths. Review chords, rests, ties, and fast passages.",
            "Notation spelling, layout, slurs, and lyric formatting cannot be reconstructed reliably from MIDI.",
            "Controller curves and expressive timing are not fully reconstructed.",
          ]
        : [
            "Page layout, chord diagrams, lyric formatting, and most written notation are not carried as editable score notation.",
            "The receiving synthesizer determines the actual instrument sound.",
          ],
      recommendation:
        "Use MusicXML to exchange written notation. Keep the original MIDI if performance timing matters.",
    },
    json: {
      name: "Engraver project",
      summary: importing
        ? "Open an editable Engraver score project."
        : "Save the complete editable score and its Engraver settings.",
      preserves: [
        "The score model, supported notation, lyrics, source metadata, layout preferences, and per-note expression",
      ],
      limitations: [
        "A score project does not include the entire library, original file attachments, or backing audio files.",
        "Other notation apps generally need MusicXML or Guitar Pro instead.",
      ],
      recommendation:
        "Use a library backup to include original files, backing audio, documents, and setlists.",
    },
    pdf: {
      name: importing ? "PDF document" : "Print / PDF",
      summary: importing
        ? "Add PDF pages to the reading and annotation workspace."
        : "Print the rendered score or save it as a PDF using the browser print dialog.",
      preserves: importing
        ? ["Original pages and their visual layout"]
        : ["The rendered appearance of the selected score or part"],
      limitations: [
        "PDF pages do not contain Engraver's editable notes or playable score data.",
        ...(importing
          ? ["Scanned music is not automatically recognized as notation."]
          : ["Print settings determine page size, margins, and scaling."]),
      ],
      recommendation:
        "Use MusicXML or Guitar Pro for editable, playable notation.",
    },
    image: {
      name: "Image document",
      summary: "Add page images for reading and annotation.",
      preserves: ["The original page image"],
      limitations: [
        "Images are not converted into editable notes or playable music.",
      ],
      recommendation:
        "Import MusicXML, Guitar Pro, or MIDI for editable music.",
    },
    original: {
      name: "Imported original",
      summary: "Download the exact file originally imported.",
      preserves: ["The original file's contents and format"],
      limitations: ["Edits made in Engraver are not included."],
      recommendation:
        "Export a project or MusicXML to include your current edits.",
    },
    backup: {
      name: "Library backup",
      summary: importing
        ? "Restore music and documents from an Engraver library backup."
        : "Save a portable copy of the local library.",
      preserves: [
        "Scores, original files, backing audio, documents, annotations, setlists, and saved revisions",
      ],
      limitations: importing
        ? ["Restore merges new items; existing IDs are not overwritten."]
        : [
            "Other notation applications cannot open a library backup as a score.",
          ],
      recommendation:
        "Keep a backup outside this browser before moving devices or clearing browser storage.",
    },
  };
  const base = info[format === "mxl" ? "musicxml" : format] ?? {
    name: format,
    summary: "Review this file format before continuing.",
    preserves: [],
    limitations: ["This file type may not be supported."],
    recommendation: "Choose a supported notation, document, or project format.",
  };
  const limitations = [...base.limitations];
  if (score && (format === "musicxml" || format === "mxl" || format === "gp")) {
    const beats = score.tracks.flatMap((t) =>
      [t, ...(t.additionalStaves ?? [])].flatMap((st) =>
        st.measures.flatMap((m) => m.voices.flatMap((v) => v.beats)),
      ),
    );
    if (
      beats.some((b) =>
        b.notes.some((n) => (n.source?.bendpoints?.length ?? 0) > 2),
      )
    )
      limitations.push(
        "This score contains detailed bend curves. Standard interchange preserves bend/release meaning, but curve timing may differ.",
      );
    if (score.tracks.filter((t) => t.type !== "percussion").length > 15)
      limitations.push(
        "This score exceeds 15 melodic MIDI channels. MusicXML assigns separate MIDI ports; audition large arrangements in the destination player.",
      );
    if (
      format === "gp" &&
      beats.some((b) =>
        b.lyricDetails?.some(
          (d) => d?.syllabic || d?.extend || d?.offsetX || d?.offsetY,
        ),
      )
    )
      limitations.push(
        "This score contains structured lyric or positioning details that Guitar Pro may simplify.",
      );
    if (format !== "gp")
      limitations.push(...(score.interchange?.warnings ?? []));
  }
  return {
    title: `${importing ? "Import" : "Export"} ${base.name}`,
    summary: base.summary,
    preserves: base.preserves,
    limitations: [...new Set(limitations)],
    recommendation: base.recommendation,
  };
}
