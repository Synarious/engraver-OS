"use client";
import { memo, useEffect, useRef, useState } from "react";
import type { AlphaTabApi, model } from "@coderline/alphatab";
import type { ScoreAST } from "../../types/score";
import { useEditorStore } from "../../store/editorStore";
import { toNativeScore } from "../../utils/alphaTabParser";
import {
  applyNotationView,
  NotationView,
  ScoreLocation,
} from "../../utils/scoreSelection";
import {
  scoreTargets,
  nearestScoreNote,
  ScoreTarget,
} from "../../utils/scoreHitTargets";
export const ScoreCanvas = memo(function ScoreCanvas({
  allTracks = false,
  zoom = 100,
  layout = "page",
  paper = "light",
  follow = true,
  editable = false,
  notationView = "combined",
}: {
  allTracks?: boolean;
  zoom?: number;
  layout?: "page" | "horizontal";
  paper?: string;
  follow?: boolean;
  editable?: boolean;
  notationView?: NotationView;
}) {
  const host = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    apiRef = useRef<AlphaTabApi | null>(null),
    pending = useRef<{
      native: model.Score | null;
      source: ScoreAST | null;
      rendered: boolean;
      midi: boolean;
      top: number;
      left: number;
    }>({
      native: null,
      source: null,
      rendered: false,
      midi: false,
      top: 0,
      left: 0,
    }),
    pointer = useRef<{ x: number; y: number } | null>(null),
    fretBuffer = useRef<{
      text: string;
      ids: string;
      timer: ReturnType<typeof setTimeout> | null;
    }>({ text: "", ids: "", timer: null });
  const s = useEditorStore(),
    { score, activeTrackId, alphaApi, scoreStatus, scoreError, setAlphaApi } =
      s,
    [retry, setRetry] = useState(0),
    [targets, setTargets] = useState<ScoreTarget[]>([]),
    [pendingFret, setPendingFret] = useState("");
  const renderTrackId = allTracks ? null : activeTrackId;
  useEffect(() => {
    let disposed = false,
      frame = 0;
    const fail = (error: unknown) => {
      if (disposed) return;
      pending.current.native = null;
      apiRef.current?.stop();
      useEditorStore
        .getState()
        .setScoreStatus(
          "error",
          error instanceof Error ? error.message : String(error),
        );
    };
    import("@coderline/alphatab")
      .then((a) => {
        if (disposed || !host.current) return;
        const api = new a.AlphaTabApi(host.current, {
          core: {
            useWorkers: false,
            fontDirectory: "/font/",
            includeNoteBounds: true,
          },
          display: { layoutMode: a.LayoutMode.Page, scale: 1 },
          player: {
            enablePlayer: true,
            enableCursor: true,
            enableAnimatedBeatCursor: true,
            enableUserInteraction: false,
            soundFont: "/soundfont/sonivox.sf2",
            scrollElement: "#score-scroll",
          },
        });
        apiRef.current = api;
        const updateReady = () => {
          const request = pending.current;
          if (
            !request.native ||
            api.score !== request.native ||
            !request.rendered
          )
            return;
          useEditorStore.getState().setScoreStatus("ready");
          useEditorStore
            .getState()
            .setPlayerReady(request.midi && api.isReadyForPlayback);
        };
        api.renderFinished.on(() => {
          if (api.score === pending.current.native) {
            pending.current.rendered = true;
            updateReady();
          }
        });
        api.postRenderFinished.on(() => {
          const native = api.score;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const request = pending.current;
            if (
              disposed ||
              !native ||
              native !== request.native ||
              !request.source ||
              !stage.current ||
              !host.current
            )
              return;
            const surface =
                host.current.querySelector(".at-surface") ?? host.current,
              origin = surface.getBoundingClientRect(),
              container = stage.current.getBoundingClientRect();
            setTargets(
              scoreTargets(api, request.source, {
                x: origin.left - container.left,
                y: origin.top - container.top,
              }),
            );
            if (scroll.current) {
              scroll.current.scrollTop = request.top;
              scroll.current.scrollLeft = request.left;
            }
          });
        });
        api.midiLoaded.on(() => {
          if (api.score === pending.current.native) {
            pending.current.midi = true;
            updateReady();
          }
        });
        api.playerReady.on(updateReady);
        api.playerStateChanged.on((e) =>
          useEditorStore.getState().setIsPlaying(e.state === 1),
        );
        api.error.on(fail);
        setAlphaApi(api);
      })
      .catch(fail);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (fretBuffer.current.timer) clearTimeout(fretBuffer.current.timer);
      pending.current.native = null;
      apiRef.current?.destroy();
      apiRef.current = null;
      setAlphaApi(null);
      useEditorStore.getState().setScoreStatus("idle");
    };
  }, [setAlphaApi, retry]);
  useEffect(() => {
    const api = apiRef.current;
    if (!api || !alphaApi) return;
    api.settings.player.enableUserInteraction = !editable;
    api.updateSettings();
  }, [alphaApi, editable]);
  useEffect(() => {
    const renderer = apiRef.current;
    if (!renderer || !alphaApi || !score) return;
    const sameScore = pending.current.source?.id === score.id,
      top = sameScore ? (scroll.current?.scrollTop ?? 0) : 0,
      left = sameScore ? (scroll.current?.scrollLeft ?? 0) : 0;
    useEditorStore.getState().setScoreStatus("loading");
    renderer.stop();
    pending.current = {
      native: null,
      source: score,
      rendered: false,
      midi: false,
      top,
      left,
    };
    try {
      const native = applyNotationView(toNativeScore(score), notationView);
      renderer.settings.display.scale = zoom / 100;
      renderer.settings.display.layoutMode = layout === "page" ? 0 : 1;
      renderer.settings.display.barsPerRow = score.engraving?.barsPerRow ?? -1;
      renderer.settings.display.systemsLayoutMode = score.source?.systemslayout
        ?.length
        ? 1
        : 0;
      renderer.settings.display.staveProfile = 0;
      renderer.settings.display.padding = Array(4).fill(
        score.engraving?.padding ?? 12,
      );
      renderer.settings.player.scrollMode = follow ? 1 : 0;
      renderer.updateSettings();
      pending.current.native = native;
      renderer.renderScore(
        native,
        renderTrackId === null
          ? score.tracks.map((_, i) => i)
          : [
              Math.max(
                0,
                score.tracks.findIndex((t) => t.id === renderTrackId),
              ),
            ],
      );
    } catch (error) {
      pending.current.native = null;
      useEditorStore
        .getState()
        .setScoreStatus(
          "error",
          error instanceof Error ? error.message : String(error),
        );
    }
  }, [
    alphaApi,
    score,
    renderTrackId,
    zoom,
    layout,
    follow,
    retry,
    notationView,
  ]);
  const run = (action: () => void) => {
    try {
      useEditorStore.getState().setSelectionError(null);
      action();
    } catch (error) {
      useEditorStore
        .getState()
        .setSelectionError(
          error instanceof Error ? error.message : String(error),
        );
    }
  };
  const clearFret = () => {
    if (fretBuffer.current.timer) clearTimeout(fretBuffer.current.timer);
    fretBuffer.current = { text: "", ids: "", timer: null };
    setPendingFret("");
  };
  const commitFret = () => {
    const buffer = fretBuffer.current,
      current = useEditorStore.getState();
    if (buffer.text && buffer.ids === current.selectedNoteIds.join("|"))
      run(() => current.updateSelection({ fret: Number(buffer.text) }));
    clearFret();
  };
  const select = (
    location: ScoreLocation,
    event?: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ) => {
    clearFret();
    const state = useEditorStore.getState();
    state.selectLocation(
      location,
      event?.shiftKey
        ? "range"
        : event?.ctrlKey || event?.metaKey || state.multiSelect
          ? "toggle"
          : "replace",
    );
    stage.current?.focus({ preventScroll: true });
  };
  const pick = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointer.current;
    pointer.current = null;
    if (
      !editable ||
      scoreStatus === "error" ||
      !stage.current ||
      !start ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7
    )
      return;
    const rect = stage.current.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top,
      hit = nearestScoreNote(
        targets,
        x,
        y,
        event.pointerType === "touch" ? 24 : 15,
      );
    if (hit) {
      select(hit.location, event);
      return;
    }
    const surface = host.current?.querySelector(".at-surface"),
      api = apiRef.current;
    if (!surface || !api?.boundsLookup) return;
    const origin = surface.getBoundingClientRect(),
      beat = api.boundsLookup.getBeatAtPos(
        event.clientX - origin.left,
        event.clientY - origin.top,
      );
    if (beat) {
      const st = beat.voice.bar.staff,
        track = score?.tracks[st.track.index],
        entry = targets.find(
          (t) =>
            t.kind === "beat" &&
            t.location.trackId === track?.id &&
            t.location.staffIndex === st.index &&
            t.location.measureIndex === beat.voice.bar.index &&
            t.location.voiceIndex === beat.voice.index &&
            t.location.beatId ===
              (st.index === 0
                ? track?.measures
                : track?.additionalStaves?.[st.index - 1]?.measures)?.[
                beat.voice.bar.index
              ]?.voices[beat.voice.index]?.beats[beat.index]?.id,
        );
      if (entry) select(entry.location, event);
    } else {
      clearFret();
      useEditorStore.getState().clearSelection();
      stage.current.focus({ preventScroll: true });
    }
  };
  const key = (e: React.KeyboardEvent) => {
    if (
      !editable ||
      scoreStatus === "error" ||
      (e.target as HTMLElement).isContentEditable
    )
      return;
    const state = useEditorStore.getState();
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (
      (e.ctrlKey || e.metaKey) &&
      ["c", "v", "z", "y"].includes(e.key.toLowerCase())
    ) {
      handled();
      run(() => {
        switch (e.key.toLowerCase()) {
          case "c":
            state.copySelection();
            break;
          case "v":
            state.pasteSelection();
            break;
          case "z":
            e.shiftKey ? state.redo() : state.undo();
            break;
          case "y":
            state.redo();
        }
      });
      return;
    }
    if (e.key === "Escape") {
      handled();
      clearFret();
      state.clearSelection();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      handled();
      clearFret();
      run(state.deleteSelection);
      return;
    }
    if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
      handled();
      commitFret();
      state.moveSelection(e.key === "ArrowLeft" ? -1 : 1, e.shiftKey);
      return;
    }
    if (["ArrowUp", "ArrowDown"].includes(e.key)) {
      handled();
      commitFret();
      run(() =>
        state.updateSelection({
          semitones: (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 12 : 1),
        }),
      );
      return;
    }
    if (e.key === "Enter" && fretBuffer.current.text) {
      handled();
      commitFret();
      return;
    }
    if (
      /^\d$/.test(e.key) &&
      !e.ctrlKey &&
      !e.metaKey &&
      state.selectedNoteIds.length
    ) {
      const fretted = targets.some(
        (t) =>
          t.location.noteId &&
          state.selectedNoteIds.includes(t.location.noteId) &&
          t.label.includes("fret "),
      );
      if (!fretted) return;
      handled();
      const ids = state.selectedNoteIds.join("|"),
        old = fretBuffer.current;
      if (old.timer) clearTimeout(old.timer);
      const text = (old.ids === ids ? old.text : "") + e.key;
      fretBuffer.current = { ids, text, timer: setTimeout(commitFret, 450) };
      setPendingFret(text);
    }
  };
  const failed = scoreStatus === "error";
  return (
    <div
      ref={scroll}
      id="score-scroll"
      className={`score-scroll paper-${paper}`}
      aria-busy={scoreStatus === "loading"}
    >
      {failed && (
        <section role="alert" className="score-error">
          <h2>This score could not be displayed</h2>
          <p>{scoreError}</p>
          <p>
            Your saved score and original file are still available. Playback and
            renderer exports are disabled until the score loads.
          </p>
          <button onClick={() => setRetry((n) => n + 1)}>
            Retry rendering
          </button>
        </section>
      )}
      {scoreStatus === "loading" && (
        <p role="status" className="score-loading">
          Loading score…
        </p>
      )}
      {editable && (
        <div className="score-selection-strip">
          <span>
            {s.selectedNoteIds.length
              ? `${s.selectedNoteIds.length} note${s.selectedNoteIds.length === 1 ? "" : "s"} selected`
              : s.selectedBeatIds.length
                ? `${s.selectedBeatIds.length} beat${s.selectedBeatIds.length === 1 ? "" : "s"} selected`
                : "Click a note or rest to edit"}
          </span>
          <span>
            {pendingFret
              ? `Fret ${pendingFret}…`
              : s.multiSelect
                ? "Multi-select is on"
                : "Shift: range · Ctrl/⌘: add to selection"}
          </span>
        </div>
      )}
      <div
        className="score-paper"
        aria-hidden={failed}
        style={{
          maxWidth: score?.engraving?.width ?? 1400,
          ...(failed
            ? {
                height: 0,
                minHeight: 0,
                overflow: "hidden",
                padding: 0,
                boxShadow: "none",
              }
            : {}),
        }}
      >
        <div
          ref={stage}
          className={`score-stage ${editable ? "is-editable" : ""}`}
          role="region"
          aria-label={editable ? "Editable music score" : "Music score"}
          tabIndex={editable ? 0 : -1}
          onPointerDown={(e) => {
            pointer.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={pick}
          onPointerCancel={() => {
            pointer.current = null;
          }}
          onKeyDown={key}
        >
          <div ref={host} />
          {editable && (
            <div className="score-selection-overlay">
              {targets.map((target) => {
                const noteSelected = target.location.noteId
                    ? s.selectedNoteIds.includes(target.location.noteId)
                    : false,
                  beatSelected =
                    s.selectedBeatIds.includes(target.location.beatId) &&
                    !target.noteIds.some((id) =>
                      s.selectedNoteIds.includes(id),
                    );
                if (target.kind === "beat" && !target.rest)
                  return beatSelected ? (
                    <div
                      key={target.key}
                      className="selected-beat-outline"
                      style={{
                        left: target.x - 3,
                        top: target.y - 3,
                        width: target.width + 6,
                        height: target.height + 6,
                      }}
                    />
                  ) : null;
                const selected =
                  target.kind === "note" ? noteSelected : beatSelected;
                return (
                  <button
                    key={target.key}
                    type="button"
                    className={`score-hit-target ${target.kind === "note" ? "note-target" : "rest-target"}`}
                    data-note-id={target.location.noteId ?? undefined}
                    data-beat-id={target.location.beatId}
                    aria-label={target.label}
                    aria-pressed={selected}
                    title={target.label}
                    tabIndex={-1}
                    disabled={failed}
                    onClick={(e) => {
                      if (e.detail === 0) select(target.location, e);
                    }}
                    style={{
                      left: target.x - 4,
                      top: target.y - 4,
                      width: target.width + 8,
                      height: target.height + 8,
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
