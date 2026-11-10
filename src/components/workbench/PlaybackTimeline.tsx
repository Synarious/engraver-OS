"use client";
import { useMemo, type CSSProperties } from "react";
import type { AlphaTabApi } from "@coderline/alphatab";
import {
  activePlaybackBlock,
  formatPlaybackTime,
  playbackSegments,
} from "../../utils/playbackTimeline";

export function PlaybackTimeline({
  api,
  current,
  end,
  tick,
  disabled,
  onSeek,
}: {
  api: AlphaTabApi | null;
  current: number;
  end: number;
  tick: number;
  disabled: boolean;
  onSeek: (time: number) => void;
}) {
  const blocks = api?.tickCache?.masterBars;
  const segments = useMemo(() => {
    const weights = playbackSegments(disabled ? [] : (blocks ?? []));
    if (!weights.length) return [{ weight: 1, start: 0, size: 1 }];
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const segments = [];
    let before = 0;
    for (const weight of weights) {
      segments.push({ weight, start: before / total, size: weight / total });
      before += weight;
    }
    return segments;
  }, [blocks, disabled]);
  const active = activePlaybackBlock(blocks ?? [], tick);
  const currentMeasure =
    active >= 0 && blocks ? blocks[active].masterBar.index + 1 : undefined;
  const played = end > 0 ? Math.max(0, Math.min(1, current / end)) : 0;
  return (
    <div className="playback-timeline" aria-label="Playback timeline">
      <div className="playback-location">
        <span
          className="playback-time"
          aria-label={`Elapsed ${formatPlaybackTime(current)}`}
        >
          {formatPlaybackTime(current)}
        </span>
        {!disabled && currentMeasure && (
          <span
            className="playback-time playback-measure"
            title={`Measure ${currentMeasure}`}
          >
            <span className="dock-sr-only">Measure </span>
            <span aria-hidden="true">M. </span>
            {currentMeasure}
          </span>
        )}
      </div>
      <div className="segmented-progress">
        <div className="progress-segments" aria-hidden="true">
          {segments.map(({ weight, start, size }, index) => {
            const fill = Math.max(0, Math.min(1, (played - start) / size));
            return (
              <span
                key={index}
                style={
                  {
                    flexGrow: weight,
                    "--segment-fill": `${fill * 100}%`,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
        <input
          aria-label="Playback position"
          aria-valuetext={`${formatPlaybackTime(current)} elapsed, ${formatPlaybackTime(end - current)} remaining${currentMeasure ? `, measure ${currentMeasure}` : ""}`}
          title="Click or drag to seek"
          type="range"
          min={0}
          max={Math.max(1, end)}
          value={Math.max(0, Math.min(end, current))}
          disabled={disabled}
          onChange={(event) => onSeek(Number(event.target.value))}
          onKeyDown={(event) => {
            if (!api) return;
            const forward = ["ArrowRight", "ArrowUp"].includes(event.key);
            const backward = ["ArrowLeft", "ArrowDown"].includes(event.key);
            if (!forward && !backward) return;
            event.preventDefault();
            onSeek(
              Math.max(
                0,
                Math.min(end, api.timePosition + (forward ? 1000 : -1000)),
              ),
            );
          }}
        />
      </div>
      <span
        className="playback-time"
        aria-label={`Remaining ${formatPlaybackTime(end - current)}`}
      >
        −{formatPlaybackTime(end - current)}
      </span>
    </div>
  );
}
