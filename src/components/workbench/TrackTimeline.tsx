"use client";
import type { CSSProperties } from "react";
import { useEditorStore } from "../../store/editorStore";
import { ActionButton } from "./ActionButton";
export function TrackTimeline({ disabled = false }: { disabled?: boolean }) {
  const s = useEditorStore();
  if (!s.score) return null;
  const count = Math.max(...s.score.tracks.map((t) => t.measures.length));
  return (
    <div className="track-timeline" aria-label="Tracks and measures">
      <div className="timeline-row timeline-ruler">
        <span>
          TRACKS <small>{s.score.tracks.length}</small>
        </span>
        <div className="timeline-measures">
          {Array.from({ length: count }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
      </div>
      {s.score.tracks.map((track, index) => (
        <div
          className="timeline-row"
          key={track.id}
          style={
            {
              "--track-accent": `hsl(${210 + index * 55} 65% 65%)`,
            } as CSSProperties
          }
        >
          <button
            className="timeline-track"
            disabled={disabled}
            aria-pressed={track.id === s.activeTrackId}
            onClick={() => s.setActiveTrack(track.id)}
          >
            <span
              className="track-color"
              style={{ background: `hsl(${210 + index * 55} 65% 65%)` }}
            />
            {track.name}
          </button>
          <div className="timeline-measures">
            {track.measures.map((measure, i) => {
              const beats = measure.voices.flatMap((v) => v.beats),
                notes = beats.flatMap((b) => b.notes);
              return (
                <ActionButton
                  key={i}
                  className={`measure-cell ${notes.length ? "contains-notes" : ""}`}
                  disabled={disabled}
                  aria-label={`${track.name}, measure ${i + 1}, ${notes.length} notes`}
                  title={`${track.name} · Measure ${i + 1} · ${notes.length} notes`}
                  aria-pressed={
                    s.activeTrackId === track.id && s.activeMeasureIndex === i
                  }
                  onClick={() => {
                    const voiceIndex = measure.voices.findIndex(
                        (v) => v.beats.length,
                      ),
                      beat = measure.voices[voiceIndex]?.beats[0];
                    if (beat)
                      s.selectLocation({
                        trackId: track.id,
                        staffIndex: 0,
                        measureIndex: i,
                        voiceIndex,
                        beatId: beat.id,
                        noteId: beat.notes[0]?.id,
                      });
                    const api = s.alphaApi;
                    if (api?.score?.masterBars[i])
                      api.tickPosition = api.score.masterBars[i].start;
                  }}
                >
                  <span
                    className="measure-density"
                    style={{
                      height: `${Math.min(90, 15 + notes.length * 5)}%`,
                    }}
                  />
                </ActionButton>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
