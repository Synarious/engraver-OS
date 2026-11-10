"use client";
import { loadPianoSoundfont } from "../../utils/soundfont";
import { enterStep } from "../../utils/stepEntry";
import { HarmonyLibrary } from "./HarmonyLibrary";
import { SavedScaleDiagrams } from "./HarmonyDiagrams";
import type { BeatAST } from "../../types/score";
import { memo, useEffect, useRef, useState } from "react";
import type { AlphaTabApi, model } from "@coderline/alphatab";
import type { ScoreAST } from "../../types/score";
import { displayedTrackIndexes } from "../../utils/pianoParts";
import {
  advancePlaybackScroll,
  centeredPlaybackPosition,
} from "../../utils/playbackFollow";
import { useEditorStore } from "../../store/editorStore";
import { toNativeScore } from "../../utils/alphaTabParser";
import {
  applyNotationView,
  NotationView,
  ScoreLocation,
  locateBeat,
  notationKinds,
} from "../../utils/scoreSelection";
import {
  insertScoreNote,
  moveScoreNote,
  shiftStaffPitch,
} from "../../utils/scoreGestures";
import {
  scoreTargets,
  nearestScoreNote,
  ScoreTarget,
} from "../../utils/scoreHitTargets";
import type { ScoreCheckJump } from "../../utils/scoreCheck";
export const ScoreCanvas = memo(function ScoreCanvas({
  allTracks = false,
  zoom = 100,
  layout = "page",
  paper = "light",
  follow = true,
  editable = false,
  notationView = "combined",
  focusRange = null,
  reveal = null,
}: {
  allTracks?: boolean;
  zoom?: number;
  layout?: "page" | "horizontal";
  paper?: string;
  follow?: boolean;
  editable?: boolean;
  notationView?: NotationView;
  focusRange?: { startTick: number; endTick: number } | null;
  reveal?: ScoreCheckJump | null;
}) {
  const host = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    followRef = useRef(follow),
    renderSettings = useRef<{ scoreKey: string; notationKey: string } | null>(
      null,
    ),
    lastReveal = useRef<ScoreCheckJump | null>(null),
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
    pointer = useRef<{ x: number; y: number; note?: ScoreTarget } | null>(null),
    fretBuffer = useRef<{
      text: string;
      ids: string;
      timer: ReturnType<typeof setTimeout> | null;
    }>({ text: "", ids: "", timer: null });
  const s = useEditorStore(),
    { score, activeTrackId, alphaApi, scoreStatus, scoreError, setAlphaApi } =
      s,
    [retry, setRetry] = useState(0),
    [targetGeometry, setTargetGeometry] = useState<{
      native: model.Score | null;
      targets: ScoreTarget[];
    }>({ native: null, targets: [] }),
    [pendingFret, setPendingFret] = useState(""),
    [focusRects, setFocusRects] = useState<
      { x: number; y: number; width: number; height: number }[]
    >([]),
    [dragPreview, setDragPreview] = useState<{ x: number; y: number } | null>(
      null,
    );
  const { targets } = targetGeometry;
  const [entering, setEntering] = useState(false);
  const [entryDuration, setEntryDuration] = useState<BeatAST["duration"]>("q");
  const [entryOctave, setEntryOctave] = useState(4);
  const entryPitches = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const step = (letter: keyof typeof entryPitches | null) => {
    try {
      let state = useEditorStore.getState();
      if (!state.activeBeatId) state.moveSelection(1);
      state = useEditorStore.getState();
      if (!state.activeTrackId || !state.activeBeatId)
        throw new Error("Choose a beat first.");
      const location = {
        trackId: state.activeTrackId,
        staffIndex: state.activeStaffIndex,
        voiceIndex: state.activeVoiceIndex,
        measureIndex: state.activeMeasureIndex,
        beatId: state.activeBeatId,
      };
      state.editScore((draft) =>
        enterStep(
          draft,
          location,
          entryDuration,
          letter === null
            ? null
            : (entryOctave + 1) * 12 + entryPitches[letter],
        ),
      );
      state.setSelectionError(null);
      state.moveSelection(1);
    } catch (error) {
      useEditorStore.getState().setSelectionError(String(error));
    }
  };
  const renderTrackId = allTracks ? null : activeTrackId;
  const pitchGestures = notationKinds(notationView).every(
    (view) => view === "staff" || view === "tab",
  );
  useEffect(() => {
    let disposed = false,
      frame = 0,
      followFrame = 0;
    let followTarget: { left: number; top: number } | null = null;
    let lastFollowTime = 0;
    let camera: { left: number; top: number; vx: number; vy: number } | null =
      null;
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
          display: {
            layoutMode: a.LayoutMode.Page,
            scale: 1,
            resources: {
              secondaryGlyphColor: new a.model.Color(0, 0, 0, 255),
            },
          },
          player: {
            enablePlayer: true,
            enableCursor: true,
            enableAnimatedBeatCursor: true,
            enableUserInteraction: false,
            scrollElement: scroll.current!,
          },
        });
        const centerBeat = (bounds: any, instant = false) => {
          const viewport = scroll.current,
            surface = host.current;
          if ((!followRef.current && !instant) || !viewport || !surface) return;
          const view = viewport.getBoundingClientRect(),
            origin = surface.getBoundingClientRect();
          const system = bounds.barBounds.masterBarBounds.visualBounds;
          const target = centeredPlaybackPosition({
            scrollLeft: viewport.scrollLeft,
            scrollTop: viewport.scrollTop,
            originLeft: origin.left,
            originTop: origin.top,
            viewLeft: view.left,
            viewTop: view.top,
            beatX: bounds.onNotesX,
            systemY: system.y,
            systemHeight: system.h,
            width: viewport.clientWidth,
            height: viewport.clientHeight,
          });
          // Retarget one animation instead of restarting a browser smooth-scroll
          // on every beat (which stalls on fast passages).
          followTarget = {
            left: Math.max(
              0,
              Math.min(
                target.left,
                viewport.scrollWidth - viewport.clientWidth,
              ),
            ),
            top: Math.max(
              0,
              Math.min(
                target.top,
                viewport.scrollHeight - viewport.clientHeight,
              ),
            ),
          };
          if (instant && !useEditorStore.getState().isPlaying) {
            cancelAnimationFrame(followFrame);
            followFrame = 0;
            camera = null;
            viewport.scrollTo({ ...followTarget, behavior: "instant" });
            return;
          }
          if (followFrame) return;
          camera = {
            left: viewport.scrollLeft,
            top: viewport.scrollTop,
            vx: 0,
            vy: 0,
          };
          lastFollowTime = performance.now();
          const animate = (now: number) => {
            followFrame = 0;
            if (disposed || !followRef.current || !followTarget) return;
            if (!camera) return;
            const elapsed = now - lastFollowTime;
            lastFollowTime = now;
            const x = advancePlaybackScroll(
              camera.left,
              camera.vx,
              followTarget.left,
              elapsed,
            );
            const y = advancePlaybackScroll(
              camera.top,
              camera.vy,
              followTarget.top,
              elapsed,
            );
            camera = {
              left: x.position,
              top: y.position,
              vx: x.velocity,
              vy: y.velocity,
            };
            viewport.scrollTo({
              left: camera.left,
              top: camera.top,
              behavior: "instant",
            });
            if (
              Math.abs(followTarget.left - camera.left) > 0.5 ||
              Math.abs(followTarget.top - camera.top) > 0.5 ||
              Math.abs(camera.vx) > 1 ||
              Math.abs(camera.vy) > 1
            )
              followFrame = requestAnimationFrame(animate);
          };
          followFrame = requestAnimationFrame(animate);
        };
        api.customScrollHandler = {
          forceScrollTo: (bounds) => centerBeat(bounds, true),
          onBeatCursorUpdating: (bounds) => centerBeat(bounds),
          [Symbol.dispose]: () => {},
        };
        apiRef.current = api;
        void loadPianoSoundfont()
          .then((bytes) => {
            if (!disposed) api.loadSoundFont(bytes);
          })
          .catch(fail);
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
            setTargetGeometry({
              native,
              targets: scoreTargets(api, request.source, {
                x: origin.left - container.left,
                y: origin.top - container.top,
              }),
            });
            if (scroll.current) {
              scroll.current.scrollTop =
                request.top ||
                (scroll.current.classList.contains("follow-centered")
                  ? scroll.current.clientHeight / 2
                  : 0);
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
      cancelAnimationFrame(followFrame);
      if (fretBuffer.current.timer) clearTimeout(fretBuffer.current.timer);
      pending.current.native = null;
      apiRef.current?.destroy();
      apiRef.current = null;
      renderSettings.current = null;
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
    const scoreKey = JSON.stringify([renderTrackId, retry]);
    const notationKey = notationKinds(notationView).join(",");
    const scale = zoom / 100;
    const layoutMode = layout === "page" ? 0 : 1;
    const previous = pending.current.source;
    const onlyPreferencesChanged =
      previous &&
      previous !== score &&
      previous.id === score.id &&
      Object.keys({ ...previous, ...score })
        .filter((key) => key !== "practice" && key !== "updatedAt")
        .every(
          (key) =>
            previous[key as keyof ScoreAST] === score[key as keyof ScoreAST],
        );
    const sameScore = previous?.id === score.id,
      top = sameScore ? (scroll.current?.scrollTop ?? 0) : 0,
      left = sameScore ? (scroll.current?.scrollLeft ?? 0) : 0;
    const native = pending.current.native;
    const canReuseScore =
      (previous === score || onlyPreferencesChanged) &&
      renderSettings.current?.scoreKey === scoreKey &&
      native &&
      renderer.score === native;
    if (canReuseScore) {
      pending.current.source = score;
      const display = renderer.settings.display;
      const viewChanged = renderSettings.current?.notationKey !== notationKey;
      if (
        !viewChanged &&
        display.scale === scale &&
        display.layoutMode === layoutMode
      )
        return;
      if (pending.current.rendered) {
        // View changes redraw the score without replacing the loaded MIDI or playhead.
        if (viewChanged) applyNotationView(native, notationView);
        renderSettings.current = { scoreKey, notationKey };
        pending.current.top = top;
        pending.current.left = left;
        display.scale = scale;
        display.layoutMode = layoutMode;
        renderer.updateSettings();
        renderer.render();
        return;
      }
    }
    renderSettings.current = { scoreKey, notationKey };
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
      renderer.settings.display.scale = scale;
      renderer.settings.display.layoutMode = layoutMode;
      renderer.settings.display.barsPerRow = score.engraving?.barsPerRow ?? -1;
      renderer.settings.display.systemsLayoutMode = score.source?.systemslayout
        ?.length
        ? 1
        : 0;
      renderer.settings.display.systemPaddingTop =
        (score.engraving?.systemGap ?? 20) / 2;
      renderer.settings.display.systemPaddingBottom =
        (score.engraving?.systemGap ?? 20) / 2;
      renderer.settings.display.trackStaffPaddingBetween =
        score.engraving?.staffGap ?? 5;
      renderer.settings.display.notationStaffPaddingBottom =
        score.engraving?.staffGap ?? 0;
      renderer.settings.display.lyricLinesPaddingBetween =
        score.engraving?.lyricLineGap ?? 5;
      const resources = renderer.settings.display.resources;
      resources.elementFonts.set(
        24,
        (resources.elementFonts.get(24) ?? resources.effectFont).withSize(
          score.engraving?.lyricFontSize ?? 12,
        ),
      );
      resources.titleFont = resources.titleFont.withSize(
        score.engraving?.titleFontSize ?? 32,
      );
      renderer.settings.display.staveProfile = 0;
      renderer.settings.display.padding = Array(4).fill(
        score.engraving?.padding ?? 12,
      );
      renderer.settings.player.scrollMode = followRef.current ? 1 : 0;
      renderer.updateSettings();
      pending.current.native = native;
      renderer.renderScore(native, displayedTrackIndexes(score, renderTrackId));
    } catch (error) {
      pending.current.native = null;
      useEditorStore
        .getState()
        .setScoreStatus(
          "error",
          error instanceof Error ? error.message : String(error),
        );
    }
  }, [alphaApi, score, renderTrackId, zoom, layout, retry, notationView]);
  useEffect(() => {
    if (
      !editable ||
      !reveal ||
      reveal === lastReveal.current ||
      reveal.scoreId !== score?.id ||
      reveal.location.beatId !== s.activeBeatId ||
      scoreStatus !== "ready" ||
      targetGeometry.native !== pending.current.native
    )
      return;
    const viewport = scroll.current;
    const scoreStage = stage.current;
    const inBeat = (target: ScoreTarget) =>
      target.location.beatId === reveal.location.beatId;
    const target =
      targets.find(
        (target) =>
          inBeat(target) && target.location.noteId === reveal.location.noteId,
      ) ?? targets.find(inBeat);
    if (!viewport || !scoreStage || !target) return;
    const view = viewport.getBoundingClientRect();
    const origin = scoreStage.getBoundingClientRect();
    const x = origin.left - view.left + target.x + target.width / 2;
    const y = origin.top - view.top + target.y + target.height / 2;
    const margin = 36;
    viewport.scrollTo({
      left:
        viewport.scrollLeft +
        (x < margin || x > viewport.clientWidth - margin
          ? x - viewport.clientWidth / 2
          : 0),
      top:
        viewport.scrollTop +
        (y < margin || y > viewport.clientHeight - margin
          ? y - viewport.clientHeight / 2
          : 0),
      behavior: "instant",
    });
    pending.current.top = viewport.scrollTop;
    pending.current.left = viewport.scrollLeft;
    lastReveal.current = reveal;
    scoreStage.focus({ preventScroll: true });
  }, [
    editable,
    reveal,
    s.activeBeatId,
    score?.id,
    scoreStatus,
    targetGeometry,
    targets,
  ]);
  useEffect(() => {
    const viewport = scroll.current;
    if (!viewport) return;
    const updatePadding = () =>
      viewport.style.setProperty(
        "--follow-padding",
        `${Math.round((viewport.parentElement?.clientHeight ?? viewport.clientHeight) / 2)}px`,
      );
    updatePadding();
    const observer = new ResizeObserver(updatePadding);
    observer.observe(viewport.parentElement ?? viewport);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    followRef.current = follow;
    if (!alphaApi) return;
    alphaApi.settings.player.scrollMode = follow ? 1 : 0;
    alphaApi.updateSettings();
    if (follow && alphaApi.isReadyForPlayback) alphaApi.scrollToCursor();
  }, [alphaApi, follow]);

  useEffect(() => {
    const api = alphaApi,
      surface = host.current,
      stageElement = stage.current;
    if (
      !focusRange ||
      !api?.score ||
      targetGeometry.native !== api.score ||
      !api.tickCache ||
      !api.boundsLookup ||
      !surface ||
      !stageElement ||
      scoreStatus !== "ready"
    ) {
      setFocusRects([]);
      return;
    }
    const trackIndexes = new Set(
      api.score.tracks.map((track: model.Track) => track.index),
    );
    let item = api.tickCache.findBeat(trackIndexes, focusRange.startTick);
    const groups = new Map<
      string,
      { x: number; y: number; right: number; bottom: number }
    >();
    const origin = surface.getBoundingClientRect(),
      stageRect = stageElement.getBoundingClientRect();
    const dx = origin.left - stageRect.left,
      dy = origin.top - stageRect.top;
    const seen = new Set<string>();
    for (
      let count = 0;
      item && item.start < focusRange.endTick && count < 10000;
      count++
    ) {
      const key = `${item.start}:${item.beat.id}`;
      if (seen.has(key)) break;
      seen.add(key);
      for (const bounds of api.boundsLookup.findBeats(item.beat) ?? []) {
        const system = bounds.barBounds.masterBarBounds.visualBounds;
        const groupKey = `${Math.round(system.y)}:${Math.round(system.h)}`;
        const left = dx + bounds.realBounds.x - 10,
          right = dx + bounds.realBounds.x + bounds.realBounds.w + 10;
        const top = dy + system.y - 8,
          bottom = dy + system.y + system.h + 8;
        const existing = groups.get(groupKey);
        if (existing) {
          existing.x = Math.min(existing.x, left);
          existing.right = Math.max(existing.right, right);
        } else groups.set(groupKey, { x: left, y: top, right, bottom });
      }
      item = item.nextBeat;
    }
    setFocusRects(
      [...groups.values()].map(({ x, y, right, bottom }) => ({
        x,
        y,
        width: right - x,
        height: bottom - y,
      })),
    );
  }, [
    alphaApi,
    focusRange,
    scoreStatus,
    targetGeometry,
    zoom,
    layout,
    renderTrackId,
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
    setDragPreview(null);
    if (
      editable &&
      scoreStatus === "ready" &&
      start?.note &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7
    ) {
      const rect = stage.current!.getBoundingClientRect();
      const destination = beatAt(
        event.clientX - rect.left,
        event.clientY - rect.top,
        start.note.location,
      );
      if (destination)
        run(() => {
          const state = useEditorStore.getState();
          let next: ScoreLocation | undefined;
          state.editScore((draft) => {
            next = moveScoreNote(
              draft,
              start.note!.location,
              destination.location,
              Math.round((start.y - event.clientY) / ((5 * zoom) / 100)),
            );
          });
          if (next) select(next);
        });
      return;
    }
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
  const beatAt = (x: number, y: number, within?: ScoreLocation) => {
    let best: ScoreTarget | undefined,
      distance = Infinity;
    for (const t of targets) {
      if (
        t.kind !== "beat" ||
        (within &&
          (t.location.trackId !== within.trackId ||
            t.location.staffIndex !== within.staffIndex ||
            t.location.voiceIndex !== within.voiceIndex))
      )
        continue;
      const dy = Math.max(t.y - y, 0, y - t.y - t.height);
      if (dy > (30 * zoom) / 100) continue;
      const d = Math.abs(x - t.x) + dy * 4;
      if (d < distance) {
        best = t;
        distance = d;
      }
    }
    return best;
  };
  const addAt = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      !editable ||
      !pitchGestures ||
      scoreStatus !== "ready" ||
      event.button !== 0 ||
      !score ||
      !stage.current
    )
      return;
    event.preventDefault();
    const rect = stage.current.getBoundingClientRect(),
      x = event.clientX - rect.left,
      y = event.clientY - rect.top;
    const target = beatAt(x, y);
    if (!target) return;
    const reference = targets
      .filter(
        (t) =>
          t.kind === "note" &&
          t.location.trackId === target.location.trackId &&
          t.location.staffIndex === target.location.staffIndex &&
          Math.abs(t.y - target.y) < target.height + 30,
      )
      .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    const entry = reference ? locateBeat(score, reference.location) : null;
    let pitch = entry?.note
      ? shiftStaffPitch(
          entry.note.pitch,
          Math.round(
            (reference!.y + reference!.height / 2 - y) / ((5 * zoom) / 100),
          ),
        )
      : 64;
    // Double-clicking an existing note adds the next free staff position above it.
    const occupied = locateBeat(score, target.location)?.beat.notes ?? [];
    while (occupied.some((n) => n.pitch === pitch) && pitch < 127)
      pitch = shiftStaffPitch(pitch, 1);
    run(() => {
      const state = useEditorStore.getState();
      let id = "";
      state.editScore((draft) => {
        id = insertScoreNote(draft, target.location, pitch);
      });
      select({ ...target.location, noteId: id });
    });
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
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const letter = e.key.toLowerCase();
      if (letter === "n" || (entering && letter === "escape")) {
        handled();
        setEntering(letter === "n" && !entering);
        return;
      }
      if (entering && /^[1-5]$/.test(letter)) {
        handled();
        setEntryDuration(
          (["w", "h", "q", "e", "s"] as const)[Number(letter) - 1],
        );
        return;
      }
      if (entering && (letter === "0" || Object.hasOwn(entryPitches, letter))) {
        handled();
        if (!e.repeat)
          step(letter === "0" ? null : (letter as keyof typeof entryPitches));
        return;
      }
    }
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
      className={`score-scroll paper-${paper} ${follow && !editable ? "follow-centered" : ""}`}
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
        <div
          className="toolbar wrap studio-step-entry"
          role="group"
          aria-label="Step entry"
        >
          <button
            type="button"
            aria-pressed={entering}
            onClick={() => {
              if (!entering && !s.activeBeatId) s.moveSelection(1);
              setEntering(!entering);
              stage.current?.focus({ preventScroll: true });
            }}
          >
            {entering ? "Done entering" : "Enter notes"}
          </button>
          <HarmonyLibrary />
          {entering && (
            <>
              <select
                aria-label="Entry duration"
                value={entryDuration}
                onChange={(event) => {
                  setEntryDuration(event.target.value as BeatAST["duration"]);
                }}
              >
                {(
                  [
                    ["w", "Whole"],
                    ["h", "Half"],
                    ["q", "Quarter"],
                    ["e", "Eighth"],
                    ["s", "Sixteenth"],
                  ] as const
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Entry octave"
                value={entryOctave}
                onChange={(event) => setEntryOctave(Number(event.target.value))}
              >
                {[2, 3, 4, 5, 6].map((octave) => (
                  <option key={octave} value={octave}>
                    Octave {octave}
                  </option>
                ))}
              </select>
              {(["c", "d", "e", "f", "g", "a", "b", null] as const).map(
                (pitch) => (
                  <button
                    type="button"
                    key={pitch ?? "rest"}
                    onClick={() => step(pitch)}
                  >
                    {pitch?.toUpperCase() ?? "Rest"}
                  </button>
                ),
              )}
              {s.selectionError && <span role="alert">{s.selectionError}</span>}
            </>
          )}
        </div>
      )}
      {editable && (
        <div className="score-selection-strip">
          <span>
            {s.selectedNoteIds.length ? (
              `${s.selectedNoteIds.length} note${s.selectedNoteIds.length === 1 ? "" : "s"} selected`
            ) : s.selectedBeatIds.length ? (
              `${s.selectedBeatIds.length} beat${s.selectedBeatIds.length === 1 ? "" : "s"} selected`
            ) : (
              <>
                <span className="score-mouse-hint">
                  {pitchGestures
                    ? "Click to select · Double-click to add · Drag to move"
                    : "Click to select · Use note entry or the inspector to edit"}
                </span>
                <span className="score-touch-hint">
                  Tap a note or rest to select it
                </span>
              </>
            )}
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
            if (e.button !== 0) return;
            const rect = stage.current!.getBoundingClientRect();
            const note =
              editable && pitchGestures && scoreStatus === "ready"
                ? nearestScoreNote(
                    targets,
                    e.clientX - rect.left,
                    e.clientY - rect.top,
                    10,
                  )
                : undefined;
            pointer.current = { x: e.clientX, y: e.clientY, note };
            if (note) e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const start = pointer.current;
            if (
              !editable ||
              !start?.note ||
              Math.hypot(e.clientX - start.x, e.clientY - start.y) <= 7
            )
              return;
            const rect = stage.current!.getBoundingClientRect();
            setDragPreview({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
            });
          }}
          onPointerUp={pick}
          onDoubleClick={addAt}
          onPointerCancel={() => {
            pointer.current = null;
            setDragPreview(null);
          }}
          onKeyDown={key}
        >
          <div ref={host} />
          {focusRange && focusRects.length > 0 && (
            <svg
              className="score-focus-mask"
              width="100%"
              height="100%"
              aria-hidden="true"
            >
              <defs>
                <mask id="focus-mask">
                  <rect width="100%" height="100%" fill="white" />
                  {focusRects.map((r, i) => (
                    <rect key={i} {...r} rx="4" fill="black" />
                  ))}
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="black"
                opacity="0.58"
                mask="url(#focus-mask)"
              />
            </svg>
          )}
          {dragPreview && (
            <div
              className="score-drag-preview"
              style={{ left: dragPreview.x, top: dragPreview.y }}
            />
          )}
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
        {!failed && score && (
          <SavedScaleDiagrams score={score} trackId={renderTrackId} />
        )}
      </div>
    </div>
  );
});
