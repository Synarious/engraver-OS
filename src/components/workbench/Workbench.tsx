"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionButton } from "./ActionButton";
import { useEditorStore } from "../../store/editorStore";
import { ScoreAST } from "../../types/score";
import {
  LibraryDocument,
  Setlist,
  initDatabase,
  listLibrary,
  importFile,
  backupLibrary,
  restoreLibrary,
  download,
  flushSaves,
  saveScore,
  putDocument,
} from "../../storage/fileSystem";
import { askText } from "../../utils/dialog";
import { blankScore } from "../../utils/project";
import { examples, loadExample } from "../../utils/examples";
import { TransferDialog } from "./TransferDialog";
import {
  formatReport,
  fileFormat,
  FormatReport,
} from "../../utils/formatReport";
import { compressMusicXML } from "../../utils/musicxmlDocument";
import { exportMusicXML } from "../../utils/musicxml";
import { toNativeScore } from "../../utils/alphaTabParser";
import { Library, LibraryItem } from "./Library";
import { ScoreCanvas } from "./ScoreCanvas";
import { DocumentReader } from "./DocumentReader";
import { BackingTrack } from "./BackingTrack";
import { EditorTools } from "./EditorTools";
import { LayoutPresets } from "./LayoutPresets";
import { TrackTimeline } from "./TrackTimeline";
import { PlaybackTimeline } from "./PlaybackTimeline";
import { activePlaybackBlock } from "../../utils/playbackTimeline";
import { NoteInspector } from "./NoteInspector";
import { hasTablature, NotationView } from "../../utils/scoreSelection";

import { SidebarMode, instrumentSidebarMode } from "../../utils/sidebarMode";
type Workspace = "library" | "compose" | "perform";
interface Preferences {
  sidebarMode: SidebarMode;
  notationView: NotationView;
  editorUiVersion: number;
  theme: "dark" | "light" | "system" | "inverted";
  workspace: Workspace;
  paper: "light" | "dark" | "sepia";
  zoom: number;
  layout: "page" | "horizontal";
  allTracks: boolean;
  tools: boolean;
  speed: number;
  metronome: boolean;
  countIn: boolean;
  follow: boolean;
  keepAwake: boolean;
  panelWidth: number;
  previousKey: string;
  nextKey: string;
}
const defaults: Preferences = {
  sidebarMode: "both",
  notationView: "combined",
  editorUiVersion: 2,
  theme: "system",
  workspace: "library",
  paper: "light",
  zoom: 100,
  layout: "page",
  allTracks: false,
  tools: false,
  speed: 1,
  metronome: false,
  countIn: false,
  follow: true,
  keepAwake: true,
  panelWidth: 300,
  previousKey: "PageUp",
  nextKey: "PageDown",
};
export default function Workbench() {
  const [dialog, setDialog] = useState<{
      title: string;
      initial: string;
      resolve: (value: string | null) => void;
    } | null>(null),
    [dialogText, setDialogText] = useState("");
  const [transferReview, setTransferReview] = useState<{
    reports: FormatReport[];
    action: string;
    proceed: () => void;
  } | null>(null);
  const s = useEditorStore(),
    [prefs, setPrefs] = useState(defaults),
    [ready, setReady] = useState(false),
    [items, setItems] = useState<LibraryItem[]>([]),
    [setlists, setSetlists] = useState<Setlist[]>([]),
    [document, setDocument] = useState<LibraryDocument | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("saved"),
    [settings, setSettings] = useState(false),
    [position, setPosition] = useState({ current: 0, end: 0, tick: 0 }),
    [loop, setLoop] = useState(false),
    [loopStart, setLoopStart] = useState<number | null>(null),
    [focusRange, setFocusRange] = useState<{
      startTick: number;
      endTick: number;
    } | null>(null),
    [conflict, setConflict] = useState(false),
    [usage, setUsage] = useState(""),
    [revisions, setRevisions] = useState<any[]>([]),
    [showRecovery, setShowRecovery] = useState(false),
    [full, setFull] = useState(false),
    [mobileActions, setMobileActions] = useState(false),
    [menuState, setMenuState] = useState<"export" | "view" | null>(null);
  const importInput = useRef<HTMLInputElement>(null),
    activeItemRef = useRef<string | undefined>(undefined),
    backupInput = useRef<HTMLInputElement>(null),
    root = useRef<HTMLDivElement>(null),
    readerArea = useRef<HTMLDivElement>(null),
    installPrompt = useRef<any>(null),
    [installable, setInstallable] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setItems(await listLibrary());
      const db = await initDatabase();
      setSetlists(await db.getAll("setlists"));
    } catch (e) {
      setMessage(`Cannot read local library: ${String(e)}`);
    }
  }, []);
  const preference = <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    if (
      ["speed", "metronome", "countIn", "follow"].includes(key) &&
      s.score &&
      !document
    )
      s.editScore((score) => {
        score.practice = { ...score.practice, [key]: value };
      });
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = localStorage.getItem("engraver-preferences");
        if (saved) {
          const previous = JSON.parse(saved);
          setPrefs({
            ...defaults,
            ...previous,
            workspace:
              previous.workspace === "practice"
                ? "perform"
                : previous.workspace,
            tools: previous.editorUiVersion === 2 ? previous.tools : false,
            editorUiVersion: 2,
          });
        }
        const library = await listLibrary();
        if (cancelled) return;
        setItems(library);
        const db = await initDatabase();
        setSetlists(await db.getAll("setlists"));
        const url = new URL(window.location.href);
        const example = examples.find(
          (example) => example.id === url.searchParams.get("example"),
        );
        if (example) {
          const loaded = await loadExample(example.id);
          if (cancelled) return;
          await saveScore(loaded.score, loaded.original);
          if (cancelled) return;
          s.setScore(loaded.score, false);
          setDocument(null);
          setPrefs((p) => ({ ...p, workspace: "compose", allTracks: false }));
          sessionStorage.setItem("engraver-last-open", loaded.score.id);
          url.searchParams.delete("example");
          url.searchParams.set("score", loaded.score.id);
          window.history.replaceState(null, "", url);
          setItems(await listLibrary());
          setMessage(
            "Opened an editable example in this tab. MIDI timing is quantized to sixteenths; the original MIDI is retained.",
          );
        } else {
          const last =
            url.searchParams.get("score") ??
            sessionStorage.getItem("engraver-last-open") ??
            localStorage.getItem("engraver-last-open");
          const item = library.find((i) => i.id === last && !i.deletedAt);
          if (item) {
            sessionStorage.setItem("engraver-last-open", item.id);
            if ("kind" in item) setDocument(item);
            else {
              s.setScore(item, false);
              if (item.practice) setPrefs((p) => ({ ...p, ...item.practice }));
            }
          } else setPrefs((p) => ({ ...p, workspace: "library" }));
        }
        if (navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          setUsage(
            `${((est.usage ?? 0) / 1048576).toFixed(1)} MB used of ${((est.quota ?? 0) / 1048576).toFixed(0)} MB available`,
          );
        }
      } catch (e) {
        setMessage(`Unable to open the library or example: ${String(e)}`);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    const prompt = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setDialog(detail);
      setDialogText(detail.initial);
    };
    window.addEventListener("engraver-prompt", prompt);
    const changed = () => void refresh(),
      remote = (event: Event) => {
        if (
          activeItemRef.current &&
          (event as CustomEvent).detail?.id === activeItemRef.current
        )
          setConflict(true);
        void refresh();
      };
    const save = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setStatus(detail.status);
      if (detail.error)
        setMessage(
          `Save failed: ${detail.error}. Export a backup before closing.`,
        );
    };
    const install = (e: Event) => {
      e.preventDefault();
      installPrompt.current = e;
      setInstallable(true);
    };
    window.addEventListener("library-changed", changed);
    window.addEventListener("library-remote-changed", remote);
    window.addEventListener("score-save", save);
    window.addEventListener("beforeinstallprompt", install);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker
        .register("/sw.js")
        .catch((e) => setMessage(`Offline caching unavailable: ${String(e)}`));
    return () => {
      cancelled = true;
      window.removeEventListener("engraver-prompt", prompt);
      window.removeEventListener("library-changed", changed);
      window.removeEventListener("library-remote-changed", remote);
      window.removeEventListener("score-save", save);
      window.removeEventListener("beforeinstallprompt", install);
    };
    // Store actions are stable; run restoration once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("engraver-preferences", JSON.stringify(prefs));
      } catch (e) {
        queueMicrotask(() =>
          setMessage(`Preferences could not be saved: ${String(e)}`),
        );
      }
  }, [prefs, ready]);
  useEffect(() => {
    if (!menuState && !mobileActions) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".topbar-menu")) setMenuState(null);
      if (!target?.closest(".action-bar, .mobile-actions-toggle"))
        setMobileActions(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuState(null);
        setMobileActions(false);
      }
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [menuState, mobileActions]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)"),
      apply = () => {
        root.current?.setAttribute(
          "data-theme",
          prefs.theme === "system"
            ? media.matches
              ? "dark"
              : "light"
            : prefs.theme,
        );
      };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs.theme, ready]);
  useEffect(() => {
    if (!s.alphaApi) return;
    const api = s.alphaApi;
    const pos = (e: any) =>
      setPosition({
        current: e.currentTime,
        end: e.endTime,
        tick: e.currentTick,
      });
    api.playerPositionChanged.on(pos);
    return () => api.playerPositionChanged.off(pos);
  }, [s.alphaApi]);
  useEffect(() => {
    if (s.alphaApi) {
      useEditorStore.getState().alphaApi.playbackSpeed = prefs.speed;
      useEditorStore.getState().alphaApi.metronomeVolume = prefs.metronome
        ? 0.7
        : 0;
      useEditorStore.getState().alphaApi.countInVolume = prefs.countIn
        ? 0.7
        : 0;
      useEditorStore.getState().alphaApi.isLooping = loop;
    }
  }, [s.alphaApi, prefs.speed, prefs.metronome, prefs.countIn, loop]);
  useEffect(() => {
    if (prefs.workspace !== "perform" || !prefs.keepAwake) return;
    let lock: any,
      cancelled = false;
    const acquire = async () => {
      try {
        if (
          "wakeLock" in navigator &&
          globalThis.document.visibilityState === "visible"
        ) {
          const next = await (navigator as any).wakeLock.request("screen");
          if (cancelled) await next.release();
          else lock = next;
        }
      } catch (e) {
        setMessage(`Screen wake lock unavailable: ${String(e)}`);
      }
    };
    void acquire();
    globalThis.document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      void lock?.release();
      globalThis.document.removeEventListener("visibilitychange", acquire);
    };
  }, [prefs.workspace, prefs.keepAwake]);
  const open = async (item: LibraryItem) => {
    try {
      await flushSaves();
      if ("kind" in item) {
        setDocument(item);
        s.alphaApi?.stop();
        preference("workspace", "perform");
      } else {
        setDocument(null);
        if (!item.updatedAt) await saveScore(item);
        s.setScore(item, false);
        if (item.practice) setPrefs((p) => ({ ...p, ...item.practice }));
        preference("workspace", "compose");
      }
      localStorage.setItem("engraver-last-open", item.id);
      sessionStorage.setItem("engraver-last-open", item.id);
      const itemUrl = new URL(window.location.href);
      itemUrl.searchParams.delete("example");
      itemUrl.searchParams.set("score", item.id);
      window.history.replaceState(null, "", itemUrl);
      setConflict(false);
      setPosition({ current: 0, end: 0, tick: 0 });
      if (s.alphaApi) s.alphaApi.playbackRange = null;
      setLoopStart(null);
      setFocusRange(null);
      setLoop(false);
    } catch (e) {
      setMessage(String(e));
    }
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const loadFiles = (files: FileList | File[] | null) => {
    if (!files) return;
    const selection = Array.from(files);
    void run(async () => {
      let last: LibraryItem | undefined;
      const failures: string[] = [];
      const warnings: string[] = [];
      for (const file of selection) {
        try {
          last = await importFile(file);
          if (!("kind" in last))
            warnings.push(
              ...(last.interchange?.warnings ?? []).map(
                (w) => `${file.name}: ${w}`,
              ),
            );
        } catch (e) {
          failures.push(`${file.name}: ${String(e)}`);
        }
      }
      if (last) await open(last);
      setMessage(
        warnings.length || failures.length
          ? [...failures, ...warnings].join("\n")
          : selection.some((f) => /\.midi?$/i.test(f.name))
            ? "MIDI imported at sixteenth-note resolution. Review timing, tempo changes, and notation before performing."
            : selection.some((f) => /\.(pdf|png|jpe?g|webp)$/i.test(f.name))
              ? "Imported locally. PDF and image pages are for reading and annotation; their music and text are not converted into editable notation."
              : `Imported and saved ${selection.length} file(s) locally.`,
      );
    });
  };
  const reviewFiles = (files: FileList | null) => {
    const selection = Array.from(files ?? []);
    if (selection.length)
      setTransferReview({
        reports: [...new Set(selection.map((f) => fileFormat(f.name)))].map(
          (format) => formatReport(format, "import"),
        ),
        action: `Import ${selection.length} file${selection.length === 1 ? "" : "s"}`,
        proceed: () => loadFiles(selection),
      });
  };
  const exportScore = async (format: string) => {
    if (!s.score) return;
    if (["gp", "midi", "pdf"].includes(format) && s.scoreStatus !== "ready")
      throw new Error(
        "Wait for the score to finish rendering before exporting this format.",
      );
    if (format === "midi" && !s.playerReady)
      throw new Error("MIDI data is not ready yet.");
    const score = s.score;
    if (format === "json")
      download(
        `${score.title}.json`,
        new Blob([JSON.stringify(score, null, 2)], {
          type: "application/json",
        }),
      );
    if (format === "musicxml" || format === "mxl") {
      download(
        `${score.title}.${format === "mxl" ? "mxl" : "musicxml"}`,
        new Blob(
          [
            format === "mxl"
              ? new Uint8Array(compressMusicXML(exportMusicXML(score)))
              : exportMusicXML(score),
          ],
          {
            type:
              format === "mxl"
                ? "application/vnd.recordare.musicxml"
                : "application/vnd.recordare.musicxml+xml",
          },
        ),
      );
      setMessage(
        "MusicXML exported. Page layout and instrument sound may differ in other apps. Keep an Engraver project for continued editing.",
      );
    }
    if (format === "gp") {
      const a = await import("@coderline/alphatab");
      const bytes = new a.exporter.Gp7Exporter().export(toNativeScore(score));
      download(
        `${score.title}.gp`,
        new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }),
      );
    }
    if (format === "midi") s.alphaApi?.downloadMidi();
    if (format === "pdf") s.alphaApi?.print();
    if (format === "original") {
      const db = await initDatabase();
      const original = await db.get("originals", score.id);
      if (original) download(original.filename, original.original);
      else
        setMessage("This score was created here and has no imported original.");
    }
  };
  const fullscreen = async () => {
    try {
      if (globalThis.document.fullscreenElement) {
        await globalThis.document.exitFullscreen();
        setFull(false);
      } else {
        await root.current?.requestFullscreen();
        setFull(true);
      }
    } catch (e) {
      setMessage(`Fullscreen unavailable: ${String(e)}`);
    }
  };
  const turn = (delta: number) =>
    readerArea.current?.querySelector("#score-scroll")?.scrollBy({
      top: delta * (readerArea.current?.clientHeight ?? 500) * 0.85,
      behavior: "smooth",
    });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const editor = useEditorStore.getState();
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        document ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;
      if (
        prefs.workspace === "perform" &&
        ["ArrowRight", prefs.nextKey, "ArrowLeft", prefs.previousKey].includes(
          e.key,
        )
      ) {
        e.preventDefault();
        turn(["ArrowRight", prefs.nextKey].includes(e.key) ? 1 : -1);
      }
      if (
        e.code === "Space" &&
        prefs.workspace !== "library" &&
        editor.scoreStatus === "ready" &&
        editor.playerReady &&
        !(e.target as Element)?.closest("button,summary")
      ) {
        e.preventDefault();
        editor.alphaApi?.playPause();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? editor.redo() : editor.undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [prefs.workspace, prefs.nextKey, prefs.previousKey, document]);
  const activeId = document?.id ?? s.score?.id;
  useEffect(() => {
    activeItemRef.current = activeId;
  }, [activeId]);
  const currentSet = setlists.find(
    (list) => activeId && list.items.includes(activeId),
  );
  const nextSetItem = () => {
    if (!currentSet) return;
    const i = currentSet.items.indexOf(activeId!);
    const next = items.find(
      (item) => item.id === currentSet.items[i + 1] && !item.deletedAt,
    );
    if (next) void open(next);
    else setMessage("End of setlist.");
  };
  const active = s.score?.tracks.find((t) => t.id === s.activeTrackId);
  const hasTab = hasTablature(
    s.score,
    prefs.allTracks ? null : s.activeTrackId,
  );
  const notationView = hasTab ? prefs.notationView : "staff";
  const playbackBars = s.alphaApi?.tickCache?.masterBars ?? [];
  const playbackBarIndex = activePlaybackBlock(playbackBars, position.tick);
  const playbackMeasure =
    playbackBarIndex >= 0
      ? playbackBars[playbackBarIndex].masterBar.index + 1
      : null;
  const canRender = s.scoreStatus === "ready" && !!s.alphaApi;
  const canPlay = canRender && s.playerReady;
  if (!ready)
    return <main className="loading">Opening your local music library…</main>;
  return (
    <div
      ref={root}
      className="workbench"
      data-theme="dark"
      data-workspace={prefs.workspace}
    >
      <header className="app-header">
        <ActionButton
          className="brand"
          onClick={() => preference("workspace", "library")}
        >
          <span>𝄞</span> Engraver
        </ActionButton>
        {!document && prefs.workspace !== "library" && s.score && (
          <div
            className="header-score-context"
            aria-label="Current score and zoom"
          >
            <span className="header-score-title" title={s.score.title}>
              {s.score.title}
            </span>
            <div className="header-zoom" role="group" aria-label="Score zoom">
              <button
                type="button"
                aria-label="Zoom out"
                title="Zoom out"
                disabled={prefs.zoom <= 50}
                onClick={() =>
                  preference("zoom", Math.max(50, prefs.zoom - 10))
                }
              >
                −
              </button>
              <span aria-live="polite">{prefs.zoom}%</span>
              <button
                type="button"
                aria-label="Zoom in"
                title="Zoom in"
                disabled={prefs.zoom >= 200}
                onClick={() =>
                  preference("zoom", Math.min(200, prefs.zoom + 10))
                }
              >
                +
              </button>
            </div>
          </div>
        )}
        <button
          className="mobile-actions-toggle"
          aria-expanded={mobileActions}
          onClick={() => setMobileActions(!mobileActions)}
        >
          Actions
        </button>
        <div
          className="action-bar toolbar wrap"
          data-mobile-open={mobileActions}
        >
          <ActionButton
            disabled={busy}
            onClick={async () => {
              const title = await askText("Score title", "Untitled");
              if (title !== null)
                void run(() => open(blankScore(title || "Untitled")));
            }}
          >
            + New score
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() => importInput.current?.click()}
          >
            Import music
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() =>
              setTransferReview({
                reports: [formatReport("backup", "export")],
                action: "Download library backup",
                proceed: () => void run(backupLibrary),
              })
            }
          >
            Back up library
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() => backupInput.current?.click()}
          >
            Restore backup
          </ActionButton>
          {prefs.workspace !== "library" && (
            <>
              <ActionButton
                disabled={s.historyIndex <= 0 || !!document || conflict}
                onClick={s.undo}
              >
                Undo
              </ActionButton>
              <ActionButton
                disabled={
                  s.historyIndex >= s.history.length - 1 ||
                  !!document ||
                  conflict
                }
                onClick={s.redo}
              >
                Redo
              </ActionButton>
              {!document && (
                <div className="export-menu topbar-menu">
                  <button
                    type="button"
                    className="topbar-menu-trigger"
                    aria-expanded={menuState === "export"}
                    aria-controls="export-popup"
                    onClick={() =>
                      setMenuState(menuState === "export" ? null : "export")
                    }
                  >
                    Export <span aria-hidden="true">▾</span>
                  </button>
                  {menuState === "export" && (
                    <div
                      id="export-popup"
                      className="topbar-popup export-popup"
                      role="group"
                      aria-label="Export and print"
                    >
                      {(
                        [
                          ["json", "Engraver project", false],
                          ["musicxml", "MusicXML", false],
                          ["mxl", "Compressed MusicXML (.mxl)", false],
                          ["gp", "Guitar Pro", !canRender],
                          ["midi", "MIDI", !canPlay],
                          ["pdf", "Print / Save PDF", !canRender],
                          ["original", "Imported original", false],
                        ] as const
                      ).map(([format, label, disabled]) => (
                        <button
                          key={format}
                          type="button"
                          disabled={disabled || busy || conflict}
                          onClick={() => {
                            setMenuState(null);
                            setMobileActions(false);
                            setTransferReview({
                              reports: [
                                formatReport(
                                  format,
                                  "export",
                                  s.score ?? undefined,
                                ),
                              ],
                              action:
                                format === "pdf"
                                  ? "Open print dialog"
                                  : `Export ${label}`,
                              proceed: () =>
                                void run(() => exportScore(format)),
                            });
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <ActionButton onClick={() => void fullscreen()}>
                {full ? "Exit fullscreen" : "Fullscreen"}
              </ActionButton>
              {currentSet && (
                <ActionButton onClick={nextSetItem}>
                  Next in {currentSet.name}
                </ActionButton>
              )}
            </>
          )}
        </div>
        <nav aria-label="Workspaces">
          {(["library", "compose", "perform"] as const).map((w) => (
            <ActionButton
              key={w}
              aria-current={prefs.workspace === w ? "page" : undefined}
              disabled={w !== "library" && !activeId}
              onClick={() => preference("workspace", w)}
            >
              {w[0].toUpperCase() + w.slice(1)}
            </ActionButton>
          ))}
        </nav>
        {!document && prefs.workspace !== "library" && (
          <div className="score-view-menu topbar-menu">
            <button
              type="button"
              className="topbar-menu-trigger"
              aria-expanded={menuState === "view"}
              aria-controls="score-view-popup"
              onClick={() => setMenuState(menuState === "view" ? null : "view")}
            >
              View
            </button>
            {menuState === "view" && (
              <div
                id="score-view-popup"
                className="topbar-popup score-view-popup"
              >
                <div className="view-toolbar toolbar wrap">
                  <strong className="score-title">{s.score?.title}</strong>
                  <div
                    className="notation-switch"
                    role="group"
                    aria-label="Notation view"
                  >
                    {(["tab", "staff", "combined"] as const).map((view) => (
                      <ActionButton
                        key={view}
                        aria-pressed={notationView === view}
                        disabled={view !== "staff" && !hasTab}
                        title={
                          view !== "staff" && !hasTab
                            ? "Select a fretted instrument to use tablature"
                            : `Show ${view === "combined" ? "staff and tablature" : view}`
                        }
                        onClick={() => preference("notationView", view)}
                      >
                        {
                          { tab: "Tab", staff: "Staff", combined: "Combined" }[
                            view
                          ]
                        }
                      </ActionButton>
                    ))}
                  </div>
                  <ActionButton
                    onClick={async () => {
                      const name = await askText(
                        "Bookmark measure",
                        `Measure ${s.activeMeasureIndex + 1}`,
                      );
                      if (name)
                        s.editScore((score) => {
                          score.bookmarks = [
                            ...(score.bookmarks ?? []),
                            { name, measure: s.activeMeasureIndex },
                          ];
                        });
                    }}
                  >
                    Bookmark measure
                  </ActionButton>
                  <select
                    aria-label="Score bookmarks"
                    value=""
                    onChange={(e) => {
                      const index = Number(e.target.value),
                        api = useEditorStore.getState().alphaApi;
                      if (api?.score?.masterBars[index]) {
                        api.tickPosition = api.score.masterBars[index].start;
                        api.scrollToCursor();
                        s.setActiveMeasure(index);
                      }
                    }}
                  >
                    <option value="">Bookmarks</option>
                    {s.score?.bookmarks?.map((b, i) => (
                      <option key={i} value={b.measure}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <label>
                    Part{" "}
                    <select
                      value={prefs.allTracks ? "all" : (s.activeTrackId ?? "")}
                      onChange={(e) => {
                        preference("allTracks", e.target.value === "all");
                        if (e.target.value !== "all")
                          s.setActiveTrack(e.target.value);
                      }}
                    >
                      <option value="all">Full score</option>
                      {s.score?.tracks.map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Zoom{" "}
                    <input
                      type="range"
                      min={50}
                      max={200}
                      value={prefs.zoom}
                      onChange={(e) =>
                        preference("zoom", Number(e.target.value))
                      }
                    />
                    <span>{prefs.zoom}%</span>
                  </label>
                  <select
                    aria-label="Score layout"
                    value={prefs.layout}
                    onChange={(e) =>
                      preference(
                        "layout",
                        e.target.value as Preferences["layout"],
                      )
                    }
                  >
                    <option value="page">Page layout</option>
                    <option value="horizontal">Horizontal layout</option>
                  </select>
                  {prefs.workspace === "compose" && (
                    <ActionButton
                      aria-expanded={prefs.tools}
                      onClick={() => {
                        preference("tools", !prefs.tools);
                        setMenuState(null);
                      }}
                    >
                      Score settings
                    </ActionButton>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="header-actions">
          <ActionButton
            aria-label="Inverted dark mode"
            title={
              prefs.theme === "inverted"
                ? "Switch to dark gray with light pages"
                : "Invert score and document pages for a fully dark workspace"
            }
            aria-pressed={prefs.theme === "inverted"}
            onClick={() =>
              preference(
                "theme",
                prefs.theme === "inverted" ? "dark" : "inverted",
              )
            }
          />
          <span
            role="status"
            className={`save-state ${busy ? "working" : status}`}
          >
            {busy
              ? "Working…"
              : status === "saving"
                ? "Saving…"
                : status === "error"
                  ? "Save failed"
                  : "Saved locally"}
          </span>
          <ActionButton
            onClick={() => setSettings((v) => !v)}
            aria-expanded={settings}
          >
            Settings
          </ActionButton>
        </div>
      </header>
      <input
        ref={importInput}
        hidden
        type="file"
        multiple
        accept=".gp,.gpx,.gp3,.gp4,.gp5,.xml,.musicxml,.mxl,.mid,.midi,.json,.pdf,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          reviewFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={backupInput}
        hidden
        type="file"
        accept=".json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file)
            setTransferReview({
              reports: [formatReport("backup", "import")],
              action: "Restore backup",
              proceed: () => void run(() => restoreLibrary(file)),
            });
          e.target.value = "";
        }}
      />
      {message && (
        <div role="status" className="notice">
          <span style={{ whiteSpace: "pre-line" }}>{message}</span>
          <ActionButton
            aria-label="Dismiss message"
            onClick={() => setMessage("")}
          >
            ×
          </ActionButton>
        </div>
      )}
      {conflict && (
        <div role="alert" className="notice">
          The library changed in another tab. Editing is paused to avoid
          overwriting it.
          <ActionButton
            onClick={() =>
              void run(async () => {
                const library = await listLibrary();
                const item = library.find((i) => i.id === activeId);
                if (item) await open(item);
                setConflict(false);
              })
            }
          >
            Reload saved version
          </ActionButton>
          <ActionButton
            onClick={() =>
              void run(async () => {
                if (document) await putDocument(document);
                else if (s.score) await saveScore(s.score);
                setConflict(false);
              })
            }
          >
            Keep this version
          </ActionButton>
        </div>
      )}
      {settings && (
        <section className="settings-panel">
          <h2>Appearance & device</h2>
          <LayoutPresets
            current={prefs}
            apply={(preset) =>
              setPrefs((p) => ({
                ...p,
                ...preset,
                workspace: activeId
                  ? (preset.workspace ?? p.workspace)
                  : "library",
              }))
            }
          />
          <label>
            Previous-page key{" "}
            <input
              value={prefs.previousKey}
              onChange={(e) => preference("previousKey", e.target.value)}
            />
          </label>
          <label>
            Next-page key{" "}
            <input
              value={prefs.nextKey}
              onChange={(e) => preference("nextKey", e.target.value)}
            />
          </label>
          <label>
            Theme{" "}
            <select
              value={prefs.theme}
              onChange={(e) =>
                preference("theme", e.target.value as Preferences["theme"])
              }
            >
              {[
                ["system", "System"],
                ["light", "Light"],
                ["dark", "Dark gray"],
                ["inverted", "Inverted dark — all pages"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Score paper{" "}
            <select
              disabled={prefs.theme === "inverted"}
              title={
                prefs.theme === "inverted"
                  ? "Inverted dark mode controls page appearance"
                  : "Score paper color"
              }
              value={prefs.paper}
              onChange={(e) =>
                preference("paper", e.target.value as Preferences["paper"])
              }
            >
              {["light", "dark", "sepia"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.keepAwake}
              onChange={(e) => preference("keepAwake", e.target.checked)}
            />{" "}
            Keep screen awake in Perform
          </label>
          <p>{usage}</p>
          <ActionButton
            onClick={() =>
              void run(async () => {
                if (navigator.storage?.persist)
                  setMessage(
                    (await navigator.storage.persist())
                      ? "Persistent local storage enabled."
                      : "The browser did not grant persistent storage. Keep library backups.",
                  );
              })
            }
          >
            Request persistent storage
          </ActionButton>
          {installable && (
            <ActionButton
              onClick={async () => {
                await installPrompt.current?.prompt();
                setInstallable(false);
              }}
            >
              Install app
            </ActionButton>
          )}
          <ActionButton
            disabled={!s.score || !!document}
            onClick={() =>
              void run(async () => {
                const db = await initDatabase();
                setRevisions(
                  (await db.getAll("revisions"))
                    .filter((r) => r.scoreId === s.score?.id)
                    .sort((a, b) => b.savedAt - a.savedAt),
                );
                setShowRecovery(true);
              })
            }
          >
            Recovery snapshots
          </ActionButton>
          {showRecovery && (
            <div>
              {revisions.length === 0 ? (
                <p>No earlier snapshots yet.</p>
              ) : (
                revisions.map((r) => (
                  <ActionButton
                    key={r.id}
                    onClick={() => {
                      s.setScore(r.score);
                      setShowRecovery(false);
                    }}
                  >
                    {new Date(r.savedAt).toLocaleString()}
                  </ActionButton>
                ))
              )}
            </div>
          )}
        </section>
      )}
      <main
        className="workspace"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            reviewFiles(e.dataTransfer.files);
          }
        }}
      >
        {prefs.workspace === "library" ? (
          <Library
            items={items}
            setlists={setlists}
            open={(item) => void open(item)}
            refresh={() => void refresh()}
            downloadOriginal={(item) =>
              setTransferReview({
                reports: [formatReport("original", "export")],
                action: "Download original",
                proceed: () => download(item.filename, item.original),
              })
            }
          />
        ) : (
          <>
            <div className="editor-layout">
              {!document && prefs.workspace === "compose" && (
                <NoteInspector
                  palette
                  disabled={conflict}
                  sidebarMode={instrumentSidebarMode(
                    active?.type,
                    prefs.sidebarMode,
                  )}
                  onSidebarModeChange={(mode) =>
                    preference("sidebarMode", mode)
                  }
                />
              )}
              {!document && prefs.workspace === "compose" && prefs.tools && (
                <fieldset
                  className="tools-container"
                  style={{ width: prefs.panelWidth }}
                  onPointerUp={(e) => {
                    const width = e.currentTarget.clientWidth;
                    if (Math.abs(width - prefs.panelWidth) > 2)
                      preference("panelWidth", width);
                  }}
                  disabled={conflict}
                >
                  <EditorTools />
                </fieldset>
              )}
              <div
                ref={readerArea}
                className="reader-area"
                inert={conflict ? true : undefined}
              >
                {document ? (
                  <DocumentReader
                    key={document.id}
                    document={document}
                    onChange={setDocument}
                    previousKey={prefs.previousKey}
                    nextKey={prefs.nextKey}
                  />
                ) : (
                  <ScoreCanvas
                    allTracks={prefs.allTracks}
                    zoom={prefs.zoom}
                    layout={prefs.layout}
                    paper={prefs.paper}
                    follow={prefs.follow}
                    focusRange={
                      prefs.workspace === "perform" ? focusRange : null
                    }
                    editable={prefs.workspace === "compose"}
                    notationView={notationView}
                  />
                )}
              </div>
              {!document && prefs.workspace === "compose" && (
                <NoteInspector disabled={conflict} />
              )}
            </div>
            {!document && (
              <section
                className="transport"
                inert={conflict ? true : undefined}
              >
                {prefs.workspace === "compose" && (
                  <TrackTimeline disabled={conflict} />
                )}
                <PlaybackTimeline
                  api={s.alphaApi}
                  current={position.current}
                  end={position.end}
                  tick={position.tick}
                  disabled={!canPlay}
                />
                <fieldset
                  className="toolbar wrap transport-controls"
                  disabled={!canPlay}
                >
                  <div className="transport-left">
                    <ActionButton
                      className="transport-stop"
                      disabled={!canPlay}
                      onClick={() => s.alphaApi?.stop()}
                    >
                      Stop
                    </ActionButton>
                    {prefs.workspace === "perform" && s.score && (
                      <div
                        className="transport-now"
                        aria-label="Current playback location"
                      >
                        <strong title={s.score.title}>{s.score.title}</strong>
                        <span>
                          {focusRange
                            ? "Focus loop"
                            : playbackMeasure
                              ? `Measure ${playbackMeasure}`
                              : "Ready"}
                          {active?.name ? ` · ${active.name}` : ""}
                        </span>
                      </div>
                    )}
                  </div>
                  <ActionButton
                    className="primary transport-play"
                    disabled={!canPlay}
                    onClick={() => s.alphaApi?.playPause()}
                  >
                    {s.isPlaying ? "Pause" : "Play"}
                  </ActionButton>
                  <div className="transport-right">
                    <label className="speed-control">
                      <span>Speed {Math.round(prefs.speed * 100)}%</span>
                      <input
                        aria-label="Playback speed"
                        type="range"
                        min={0.25}
                        max={2}
                        step={0.05}
                        value={prefs.speed}
                        onChange={(e) =>
                          preference("speed", Number(e.target.value))
                        }
                      />
                    </label>
                    <div
                      className="focus-controls"
                      role="group"
                      aria-label="Loop and focus controls"
                    >
                      <ActionButton
                        aria-pressed={loop}
                        disabled={!!focusRange}
                        title={
                          focusRange
                            ? "Focus loop is active; use Focus reset to stop it"
                            : "Repeat the score"
                        }
                        onClick={() => setLoop(!loop)}
                      >
                        Loop
                      </ActionButton>
                      {prefs.workspace === "perform" && (
                        <>
                          <ActionButton
                            aria-pressed={loopStart !== null}
                            onClick={() => {
                              if (s.alphaApi) s.alphaApi.playbackRange = null;
                              setLoopStart(position.tick);
                              setFocusRange(null);
                              setLoop(false);
                            }}
                          >
                            Focus start
                          </ActionButton>
                          <ActionButton
                            aria-pressed={!!focusRange}
                            disabled={
                              loopStart === null || position.tick <= loopStart
                            }
                            onClick={() => {
                              if (
                                !s.alphaApi ||
                                loopStart === null ||
                                position.tick <= loopStart
                              )
                                return;
                              const range = {
                                startTick: loopStart,
                                endTick: position.tick,
                              };
                              s.alphaApi.playbackRange = range;
                              s.alphaApi.isLooping = true;
                              setFocusRange(range);
                              setLoop(true);
                              s.alphaApi.tickPosition = range.startTick;
                            }}
                          >
                            Focus end
                          </ActionButton>
                          <ActionButton
                            disabled={loopStart === null && !focusRange}
                            onClick={() => {
                              if (s.alphaApi) s.alphaApi.playbackRange = null;
                              setLoopStart(null);
                              setFocusRange(null);
                              setLoop(false);
                            }}
                          >
                            Focus reset
                          </ActionButton>
                          {loopStart !== null && (
                            <span role="status">
                              {focusRange
                                ? "Focus loop active"
                                : "Focus start set"}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={prefs.follow}
                        onChange={(e) => preference("follow", e.target.checked)}
                      />{" "}
                      Follow
                    </label>
                  </div>
                </fieldset>
                {prefs.workspace === "perform" && (
                  <details className="perform-options">
                    <summary aria-label="Playback tools" title="Playback tools">
                      <span className="perform-options-label">
                        More controls
                      </span>
                      <span className="perform-options-icon" aria-hidden="true">
                        ⋯
                      </span>
                    </summary>
                    <div className="perform-options-panel">
                      <fieldset
                        className="perform-extra-controls"
                        disabled={!canPlay}
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={prefs.metronome}
                            onChange={(e) =>
                              preference("metronome", e.target.checked)
                            }
                          />{" "}
                          Metronome
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={prefs.countIn}
                            onChange={(e) =>
                              preference("countIn", e.target.checked)
                            }
                          />{" "}
                          Count-in
                        </label>
                      </fieldset>
                      {prefs.workspace === "perform" && (
                        <details className="perform-mixer">
                          <summary>Instrument mixer</summary>
                          <div className="mixer">
                            {s.score?.tracks.map((t) => (
                              <div className="mixer-track" key={t.id}>
                                <ActionButton
                                  onClick={() => s.setActiveTrack(t.id)}
                                  aria-pressed={active?.id === t.id}
                                >
                                  {t.name}
                                </ActionButton>
                                <ActionButton
                                  aria-pressed={t.isMuted}
                                  onClick={() =>
                                    s.editScore((score) => {
                                      score.tracks.find(
                                        (x) => x.id === t.id,
                                      )!.isMuted = !t.isMuted;
                                    })
                                  }
                                >
                                  Mute
                                </ActionButton>
                                <ActionButton
                                  aria-pressed={t.isSolo}
                                  onClick={() =>
                                    s.editScore((score) => {
                                      score.tracks.find(
                                        (x) => x.id === t.id,
                                      )!.isSolo = !t.isSolo;
                                    })
                                  }
                                >
                                  Solo
                                </ActionButton>
                                <label>
                                  Volume{" "}
                                  <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={t.volume}
                                    onChange={(e) =>
                                      s.editScore((score) => {
                                        score.tracks.find(
                                          (x) => x.id === t.id,
                                        )!.volume = Number(e.target.value);
                                      })
                                    }
                                  />
                                </label>
                                <label>
                                  Pan{" "}
                                  <input
                                    type="range"
                                    min={-1}
                                    max={1}
                                    step={0.1}
                                    value={t.pan}
                                    onChange={(e) =>
                                      s.editScore((score) => {
                                        score.tracks.find(
                                          (x) => x.id === t.id,
                                        )!.pan = Number(e.target.value);
                                      })
                                    }
                                  />
                                </label>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {prefs.workspace === "perform" && s.score && (
                        <details className="perform-backing">
                          <summary>Backing audio</summary>
                          <BackingTrack
                            key={s.score.id}
                            scoreId={s.score.id}
                            speed={prefs.speed}
                          />
                        </details>
                      )}
                      <div className="performance-turns">
                        <ActionButton onClick={() => turn(-1)}>
                          ← Previous page
                        </ActionButton>
                        <span>
                          Arrow keys / Page Up / Page Down / keyboard pedal
                        </span>
                        <ActionButton onClick={() => turn(1)}>
                          Next page →
                        </ActionButton>
                      </div>
                    </div>
                  </details>
                )}
              </section>
            )}
          </>
        )}
      </main>
      {transferReview && (
        <TransferDialog
          reports={transferReview.reports}
          action={transferReview.action}
          onCancel={() => setTransferReview(null)}
          onContinue={() => {
            const action = transferReview.proceed;
            setTransferReview(null);
            action();
          }}
        />
      )}
      {dialog && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              dialog.resolve(dialogText);
              setDialog(null);
            }}
          >
            <h2>{dialog.title}</h2>
            <input
              aria-label={dialog.title}
              autoFocus
              value={dialogText}
              onChange={(e) => setDialogText(e.target.value)}
            />
            <div className="toolbar">
              <ActionButton
                type="button"
                onClick={() => {
                  dialog.resolve(null);
                  setDialog(null);
                }}
              >
                Cancel
              </ActionButton>
              <ActionButton className="primary" type="submit">
                Continue
              </ActionButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
