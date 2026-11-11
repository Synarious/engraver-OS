"use client";
import { useState } from "react";
import type { BeatAST } from "../../types/score";
import { useEditorStore } from "../../store/editorStore";
import { locateBeat, staffMeasures } from "../../utils/scoreSelection";
import { distributeLyrics } from "../../utils/lyrics";

export function LyricEditor() {
  const s = useEditorStore(),
    [verse, setVerse] = useState(0),
    [line, setLine] = useState("");
  const location = {
    trackId: s.activeTrackId ?? "",
    staffIndex: s.activeStaffIndex,
    measureIndex: s.activeMeasureIndex,
    voiceIndex: s.activeVoiceIndex,
    beatId: s.activeBeatId ?? "",
  };
  const active = locateBeat(s.score, location);
  if (!active) return null;
  const b = active.beat,
    detail = b.lyricDetails?.[verse];
  const edit = (update: (beat: BeatAST) => void) =>
    s.editScore((score) => {
      const target = locateBeat(score, location);
      if (target) update(target.beat);
    });
  const metadata = (patch: NonNullable<BeatAST["lyricDetails"]>[number]) =>
    edit((beat) => {
      beat.lyricDetails ??= [];
      beat.lyricDetails[verse] = { ...beat.lyricDetails[verse], ...patch };
    });
  return (
    <details className="lyric-editor">
      <summary>Lyrics & syllables</summary>
      <label>
        Verse
        <input
          aria-label="Lyric verse number"
          type="number"
          min={1}
          max={16}
          value={verse + 1}
          onChange={(e) =>
            setVerse(Math.max(0, Math.min(15, Number(e.target.value) - 1)))
          }
        />
      </label>
      <label>
        Syllable
        <input
          value={b.lyrics?.[verse] ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            edit((beat) => {
              beat.lyrics ??= [];
              beat.lyrics[verse] = value;
            });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              s.moveSelection(e.shiftKey ? -1 : 1);
            }
          }}
        />
      </label>
      <label>
        Word position
        <select
          aria-label="Syllable within word"
          value={detail?.syllabic ?? "single"}
          onChange={(e) =>
            metadata({
              syllabic: e.target.value as "single" | "begin" | "middle" | "end",
            })
          }
        >
          <option value="single">Whole word</option>
          <option value="begin">First syllable</option>
          <option value="middle">Middle syllable</option>
          <option value="end">Last syllable</option>
        </select>
      </label>
      <label>
        Melisma
        <select
          aria-label="Melisma (word extension)"
          value={detail?.extend ?? ""}
          onChange={(e) =>
            metadata({
              extend: (e.target.value || undefined) as
                "start" | "continue" | "stop" | undefined,
            })
          }
        >
          <option value="">None</option>
          <option value="start">Start</option>
          <option value="continue">Continue</option>
          <option value="stop">Stop</option>
        </select>
      </label>
      <details className="lyric-editor-options">
        <summary>MusicXML placement</summary>
        <label>
          Placement
          <select
            aria-label="Lyric placement in MusicXML"
            value={detail?.placement ?? "below"}
            onChange={(e) =>
              metadata({ placement: e.target.value as "above" | "below" })
            }
          >
            <option value="below">Below staff</option>
            <option value="above">Above staff</option>
          </select>
        </label>
        <div className="lyric-offsets">
          {(
            [
              ["offsetX", "X", "Lyric horizontal offset"],
              ["offsetY", "Y", "Lyric vertical offset"],
            ] as const
          ).map(([key, axis, label]) => (
            <label key={key}>
              {axis}
              <input
                aria-label={label}
                type="number"
                min={-200}
                max={200}
                value={detail?.[key] ?? 0}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (Number.isFinite(value))
                    metadata({ [key]: Math.max(-200, Math.min(200, value)) });
                }}
              />
            </label>
          ))}
        </div>
        <p className="editing-help">
          Placement and offsets are preserved for MusicXML export (tenths (10 =
          one staff space); positive is right/up). The score view places lyrics
          automatically.
        </p>
      </details>
      <details className="lyric-editor-options">
        <summary>Distribute lyric line</summary>
        <label>
          Distribute a lyric line
          <textarea
            aria-label="Lyric line to distribute"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder="Hel-lo world _"
          />
        </label>
        <p className="editing-help">
          Spaces advance words, hyphens divide syllables, and _ continues a word
          extension. Fills notes in this voice from the current beat, skipping
          rests.
        </p>
        <button
          type="button"
          disabled={!line.trim()}
          onClick={() => {
            try {
              s.editScore((score) => {
                const target = locateBeat(score, location);
                if (!target) return;
                const beats = staffMeasures(target.track, location.staffIndex)
                  .slice(location.measureIndex)
                  .flatMap((m) => m.voices[location.voiceIndex]?.beats ?? []);
                distributeLyrics(
                  beats.slice(beats.findIndex((b) => b.id === location.beatId)),
                  verse,
                  line,
                );
              });
              s.setSelectionError(null);
            } catch (error) {
              s.setSelectionError(
                error instanceof Error ? error.message : String(error),
              );
            }
          }}
        >
          Apply lyric line
        </button>
      </details>
    </details>
  );
}
