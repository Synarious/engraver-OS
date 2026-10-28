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
}: {
  api: AlphaTabApi | null;
  current: number;
  end: number;
  tick: number;
  disabled: boolean;
}) {
  const blocks = api?.tickCache?.masterBars;
  const weights = useMemo(
    () => playbackSegments(blocks ?? []),
    [blocks, disabled],
  );
  const active = activePlaybackBlock(blocks ?? [], tick);
  const currentMeasure =
    active >= 0 && blocks ? blocks[active].masterBar.index + 1 : undefined;
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const played = end > 0 ? Math.max(0, Math.min(1, current / end)) : 0;
  let before = 0;
  return (
    <div className="playback-timeline" aria-label="Playback timeline">
      <span
        className="playback-time"
        aria-label={`Elapsed ${formatPlaybackTime(current)}`}
      >
        {formatPlaybackTime(current)}
      </span>
      <div className="segmented-progress">
        <div className="progress-segments" aria-hidden="true">
          {(weights.length ? weights : [1]).map((weight, index) => {
            const start = total ? before / total : 0;
            before += weight;
            const size = total ? weight / total : 1;
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
          onChange={(event) => {
            if (api) api.timePosition = Number(event.target.value);
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
