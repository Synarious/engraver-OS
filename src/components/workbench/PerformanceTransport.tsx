"use client";

import { memo, useEffect, useId, useRef, useState } from "react";
import type { synth } from "@coderline/alphatab";
import { Repeat2, SlidersHorizontal } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import { ActionButton } from "./ActionButton";
import { BackingTrack } from "./BackingTrack";
import { PlaybackTimeline } from "./PlaybackTimeline";
import { TrackTimeline } from "./TrackTimeline";
import "./PerformanceTransport.css";

type PlaybackPreferences = {
  speed: number;
  follow: boolean;
  metronome: boolean;
  countIn: boolean;
};
type PlaybackRange = { startTick: number; endTick: number };
type TransportProps = {
  perform: boolean;
  blocked: boolean;
  canPlay: boolean;
  prefs: PlaybackPreferences;
  loop: boolean;
  loopStart: number | null;
  focusRange: PlaybackRange | null;
  setLoop: (loop: boolean) => void;
  setLoopStart: (tick: number | null) => void;
  setFocusRange: (range: PlaybackRange | null) => void;
  onPreferenceChange: {
    (key: "speed", value: number): void;
    (key: "follow" | "metronome" | "countIn", value: boolean): void;
  };
  onTurn: (direction: number) => void;
};

export function PerformanceTransport({
  perform,
  blocked,
  canPlay,
  prefs,
  loop,
  loopStart,
  focusRange,
  setLoop,
  setLoopStart,
  setFocusRange,
  onPreferenceChange,
  onTurn,
}: TransportProps) {
  const api = useEditorStore((state) => state.alphaApi);
  const playing = useEditorStore((state) => state.isPlaying);
  const [position, setPosition] = useState<synth.PositionChangedEventArgs>();
  const tick = canPlay ? (position?.currentTick ?? 0) : 0;
  const canSetEnd = loopStart !== null && tick > loopStart;
  const statusId = useId();

  useEffect(() => {
    if (!api) return;
    let frame = 0;
    let latest: synth.PositionChangedEventArgs | undefined;
    const update = (event: synth.PositionChangedEventArgs) => {
      latest = event;
      // Audio callbacks arrive much faster than the display can update.
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          setPosition(latest);
        });
    };
    api.playerPositionChanged.on(update);
    return () => {
      api.playerPositionChanged.off(update);
      cancelAnimationFrame(frame);
    };
  }, [api]);

  function clearPassage(start: number | null) {
    const player = useEditorStore.getState().alphaApi;
    if (player) player.playbackRange = null;
    setLoopStart(start);
    setFocusRange(null);
    setLoop(false);
  }

  function setPassageEnd() {
    const player = useEditorStore.getState().alphaApi;
    if (!player || loopStart === null || player.tickPosition <= loopStart)
      return;
    const range = { startTick: loopStart, endTick: player.tickPosition };
    player.playbackRange = range;
    player.isLooping = true;
    setFocusRange(range);
    setLoop(true);
    player.tickPosition = range.startTick;
  }

  return (
    <section
      className="performance-dock"
      data-perform={perform}
      aria-label="Score playback"
      inert={blocked || undefined}
    >
      {!perform && <TrackTimeline disabled={blocked} />}
      <PlaybackTimeline
        api={api}
        current={canPlay ? (position?.currentTime ?? 0) : 0}
        end={canPlay ? (position?.endTime ?? 0) : 0}
        tick={tick}
        disabled={!canPlay}
        onSeek={(time) => {
          const player = useEditorStore.getState().alphaApi;
          if (player) player.timePosition = time;
        }}
      />
      <div className="dock-controls">
        <fieldset
          className="dock-motion"
          aria-label="Playback"
          disabled={!canPlay}
        >
          <ActionButton
            className="primary dock-play"
            onClick={() => api?.playPause()}
          >
            {playing ? "Pause" : "Play"}
          </ActionButton>
          <ActionButton className="dock-stop" onClick={() => api?.stop()}>
            Stop
          </ActionButton>
          <PlaybackSpeed
            speed={prefs.speed}
            onPreferenceChange={onPreferenceChange}
          />
          <label className="dock-follow" title="Scroll with playback">
            <input
              type="checkbox"
              checked={prefs.follow}
              onChange={(event) =>
                onPreferenceChange("follow", event.target.checked)
              }
            />
            Follow
          </label>
        </fieldset>
        <div className="dock-practice">
          <fieldset
            className="dock-loops"
            aria-label="Playback loops"
            disabled={!canPlay}
          >
            <button
              type="button"
              className="dock-repeat"
              aria-label="Repeat score"
              aria-pressed={loop && !focusRange}
              disabled={!!focusRange}
              title={
                focusRange
                  ? "Clear the A–B loop before repeating the score"
                  : "Repeat the full score"
              }
              onClick={() => setLoop(!loop)}
            >
              <Repeat2 size={16} aria-hidden="true" /> <span>Loop</span>
            </button>
            {perform && (
              <div
                className="dock-markers"
                role="group"
                aria-label="A–B passage loop"
                aria-describedby={statusId}
              >
                <button
                  type="button"
                  aria-label="Set A, loop start"
                  aria-pressed={loopStart !== null}
                  title="Set A at the current playback position"
                  onClick={() => clearPassage(api?.tickPosition ?? tick)}
                >
                  Set A
                </button>
                <button
                  type="button"
                  aria-label="Set B, loop end"
                  aria-pressed={!!focusRange}
                  disabled={!canSetEnd}
                  title="Seek forward, then set B to repeat the passage"
                  onClick={setPassageEnd}
                >
                  Set B
                </button>
                <button
                  type="button"
                  aria-label="Clear A–B loop"
                  disabled={loopStart === null}
                  onClick={() => clearPassage(null)}
                >
                  Clear
                </button>
                <span className="dock-sr-only" id={statusId} role="status">
                  {focusRange
                    ? "Repeating the A–B passage."
                    : loopStart !== null
                      ? "Start set. Seek forward, then set B."
                      : "Set A to start marking a passage."}
                </span>
              </div>
            )}
          </fieldset>
          {perform && (
            <PlaybackTools
              canPlay={canPlay}
              prefs={prefs}
              onPreferenceChange={onPreferenceChange}
              onTurn={onTurn}
            />
          )}
        </div>
      </div>
    </section>
  );
}

const PlaybackSpeed = memo(function PlaybackSpeed({
  speed,
  onPreferenceChange,
}: Pick<TransportProps, "onPreferenceChange"> & { speed: number }) {
  const [preview, setPreview] = useState<number>();
  const pending = useRef<{ value: number; timer: number } | null>(null);
  const dragging = useRef(false);
  const value = preview ?? speed;
  const percent = Math.round(value * 100);

  useEffect(() => () => window.clearTimeout(pending.current?.timer), []);

  function commit() {
    dragging.current = false;
    const change = pending.current;
    if (!change) return;
    window.clearTimeout(change.timer);
    pending.current = null;
    setPreview(undefined);
    if (change.value !== speed) onPreferenceChange("speed", change.value);
  }

  return (
    <label className="dock-speed">
      <span>
        Speed <strong>{percent}%</strong>
      </span>
      <input
        aria-label="Playback speed"
        aria-valuetext={`${percent} percent`}
        type="range"
        min={0.25}
        max={2}
        step={0.05}
        value={value}
        onPointerDown={() => {
          dragging.current = true;
          window.clearTimeout(pending.current?.timer);
        }}
        onPointerUp={commit}
        onLostPointerCapture={commit}
        onPointerCancel={commit}
        onBlur={commit}
        onChange={(event) => {
          const next = event.currentTarget.valueAsNumber;
          window.clearTimeout(pending.current?.timer);
          setPreview(next);
          // The synth flushes queued samples for each tempo change.
          pending.current = {
            value: next,
            timer: dragging.current ? 0 : window.setTimeout(commit, 120),
          };
        }}
      />
    </label>
  );
});

const PlaybackTools = memo(function PlaybackTools({
  canPlay,
  prefs,
  onPreferenceChange,
  onTurn,
}: Pick<
  TransportProps,
  "canPlay" | "prefs" | "onPreferenceChange" | "onTurn"
>) {
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const score = useEditorStore((state) => state.score);
  const activeTrackId = useEditorStore((state) => state.activeTrackId);
  const setActiveTrack = useEditorStore((state) => state.setActiveTrack);
  const editScore = useEditorStore((state) => state.editScore);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const panel = details.current;
      if (panel?.open && !panel.contains(event.target as Node))
        panel.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <details
      className="dock-tools"
      ref={details}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !details.current?.open) return;
        event.preventDefault();
        event.stopPropagation();
        details.current.open = false;
        summary.current?.focus();
      }}
    >
      <summary ref={summary} aria-label="Playback tools">
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span>Tools</span>
      </summary>
      <div className="dock-tools-panel">
        <h2>Playback tools</h2>
        <fieldset
          className="dock-toggle-row"
          aria-label="Timing cues"
          disabled={!canPlay}
        >
          <label>
            <input
              type="checkbox"
              checked={prefs.metronome}
              onChange={(event) =>
                onPreferenceChange("metronome", event.target.checked)
              }
            />
            Metronome
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.countIn}
              onChange={(event) =>
                onPreferenceChange("countIn", event.target.checked)
              }
            />
            Count-in
          </label>
        </fieldset>
        {score && (
          <>
            <section
              className="dock-tool-section"
              aria-label="Instrument mixer"
            >
              <h3>Instrument mixer</h3>
              <div className="dock-mixer">
                {score.tracks.map((track) => (
                  <div className="dock-mixer-track" key={track.id}>
                    <button
                      type="button"
                      className="dock-mixer-name"
                      aria-pressed={activeTrackId === track.id}
                      onClick={() => setActiveTrack(track.id)}
                    >
                      {track.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Mute ${track.name}`}
                      aria-pressed={track.isMuted}
                      onClick={() =>
                        editScore((draft) => {
                          const instrument = draft.tracks.find(
                            (item) => item.id === track.id,
                          );
                          if (instrument)
                            instrument.isMuted = !instrument.isMuted;
                        })
                      }
                    >
                      Mute
                    </button>
                    <button
                      type="button"
                      aria-label={`Solo ${track.name}`}
                      aria-pressed={track.isSolo}
                      onClick={() =>
                        editScore((draft) => {
                          const instrument = draft.tracks.find(
                            (item) => item.id === track.id,
                          );
                          if (instrument)
                            instrument.isSolo = !instrument.isSolo;
                        })
                      }
                    >
                      Solo
                    </button>
                    <div className="dock-mixer-levels">
                      <label>
                        Volume
                        <input
                          aria-label={`${track.name} volume`}
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={track.volume}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            editScore((draft) => {
                              const instrument = draft.tracks.find(
                                (item) => item.id === track.id,
                              );
                              if (instrument) instrument.volume = value;
                            });
                          }}
                        />
                      </label>
                      <label>
                        Pan
                        <input
                          aria-label={`${track.name} pan`}
                          type="range"
                          min={-1}
                          max={1}
                          step={0.1}
                          value={track.pan}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            editScore((draft) => {
                              const instrument = draft.tracks.find(
                                (item) => item.id === track.id,
                              );
                              if (instrument) instrument.pan = value;
                            });
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section className="dock-tool-section" aria-label="Backing audio">
              <h3>Backing audio</h3>
              <BackingTrack
                key={score.id}
                scoreId={score.id}
                speed={prefs.speed}
              />
            </section>
          </>
        )}
        <section className="dock-tool-section" aria-label="Page turns">
          <h3>Page turns</h3>
          <div className="dock-toggle-row">
            <button type="button" onClick={() => onTurn(-1)}>
              ← Previous page
            </button>
            <button type="button" onClick={() => onTurn(1)}>
              Next page →
            </button>
          </div>
        </section>
      </div>
    </details>
  );
});
