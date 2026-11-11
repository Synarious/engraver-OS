"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Contrast, Menu, Settings2 } from "lucide-react";
import Image from "next/image";
import "./workspace-shell.css";
import "./score-canvas.css";
import "./harmony-library.css";
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
import {
  saveScorePracticePreferences,
  scorePracticePreferences,
  withScorePracticePreferences,
} from "../../utils/practicePreferences";
import { Library, LibraryItem } from "./Library";
import { ScoreCanvas } from "./ScoreCanvas";
import { ScoreCheck } from "./ScoreCheck";
import { DocumentReader } from "./DocumentReader";
import { EditorTools } from "./EditorTools";
import { LayoutPresets } from "./LayoutPresets";
import { PerformanceTransport } from "./PerformanceTransport";
import { NoteInspector } from "./NoteInspector";
import {
  hasTablature,
  notationKinds,
  notationLabels,
  type NotationKind,
  type NotationView,
} from "../../utils/scoreSelection";
import type { ScoreCheckJump } from "../../utils/scoreCheck";

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
  theme: "dark",
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
  const [scoreCheckJump, setScoreCheckJump] = useState<ScoreCheckJump | null>(
    null,
  );
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
    [compactPanel, setCompactPanel] = useState<
      "palette" | "notes" | "score" | null
    >(null),
    [menuState, setMenuState] = useState<"export" | "view" | "library" | null>(
      null,
    );
  const importInput = useRef<HTMLInputElement>(null),
    activeItemRef = useRef<string | undefined>(undefined),
    backupInput = useRef<HTMLInputElement>(null),
    root = useRef<HTMLDivElement>(null),
    promptDialog = useRef<HTMLDialogElement>(null),
    readerArea = useRef<HTMLDivElement>(null),
    installPrompt = useRef<any>(null),
    [installable, setInstallable] = useState(false);
  useEffect(() => {
    if (!dialog) return;
    const prompt = promptDialog.current;
    prompt?.showModal();
    return () => prompt?.close();
  }, [dialog]);
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
    setPrefs((p) => (p[key] === value ? p : { ...p, [key]: value }));
    if (key === "workspace") {
      setMenuState(null);
      setSettings(false);
      setCompactPanel(null);
    }
    if (
      ["speed", "metronome", "countIn", "follow"].includes(key) &&
      prefs[key] !== value &&
      s.score &&
      !document
    ) {
      try {
        saveScorePracticePreferences(s.score, { [key]: value });
      } catch {
        setMessage("Practice preferences could not be saved.");
      }
    }
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
        } else {
          const last =
            url.searchParams.get("score") ??
            sessionStorage.getItem("engraver-last-open") ??
            localStorage.getItem("engraver-last-open");
          const item = library.find((i) => i.id === last && !i.deletedAt);
          if (item) {
            sessionStorage.setItem("engraver-last-open", item.id);
            if ("kind" in item) {
              setDocument(item);
              setPrefs((p) =>
                p.workspace === "compose" ? { ...p, workspace: "perform" } : p,
              );
            } else {
              s.setScore(item, false);
              const practice = scorePracticePreferences(item);
              setPrefs((p) => ({ ...p, ...practice }));
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
    if (!menuState) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(`[data-disclosure="${menuState}"]`))
        setMenuState(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        setMenuState(null);
        root.current
          ?.querySelector<HTMLButtonElement>(`#studio-${menuState}-trigger`)
          ?.focus();
      }
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [menuState]);
  useEffect(() => {
    if (!settings) return;
    const closeSettings = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        root.current?.querySelector("dialog[open]")
      )
        return;
      setSettings(false);
      root.current
        ?.querySelector<HTMLButtonElement>("#studio-settings-trigger")
        ?.focus();
    };
    window.addEventListener("keydown", closeSettings);
    return () => window.removeEventListener("keydown", closeSettings);
  }, [settings]);
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
    // The score canvas can dispose its player before this effect runs.
    const api = useEditorStore.getState().alphaApi;
    if (!api || api !== s.alphaApi) return;
    // alphaTab seeks and clears queued samples whenever playback speed is set.
    if (api.playbackSpeed !== prefs.speed) api.playbackSpeed = prefs.speed;
    api.metronomeVolume = prefs.metronome ? 0.7 : 0;
    api.countInVolume = prefs.countIn ? 0.7 : 0;
    api.isLooping = loop;
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
        const practice = scorePracticePreferences(item);
        setPrefs((p) => ({ ...p, ...practice }));
        preference("workspace", "compose");
      }
      localStorage.setItem("engraver-last-open", item.id);
      sessionStorage.setItem("engraver-last-open", item.id);
      const itemUrl = new URL(window.location.href);
      itemUrl.searchParams.delete("example");
      itemUrl.searchParams.set("score", item.id);
      window.history.replaceState(null, "", itemUrl);
      setConflict(false);
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
        new Blob(
          [JSON.stringify(withScorePracticePreferences(score), null, 2)],
          { type: "application/json" },
        ),
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
  const turn = useCallback(
    (delta: number) => {
      const viewport = readerArea.current?.querySelector("#score-scroll");
      if (!viewport) return;
      viewport.scrollBy({
        ...(prefs.layout === "horizontal"
          ? { left: delta * viewport.clientWidth * 0.85 }
          : { top: delta * viewport.clientHeight * 0.85 }),
        behavior: "instant",
      });
    },
    [prefs.layout],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        dialog ||
        transferReview ||
        conflict ||
        globalThis.document.querySelector("dialog[open]")
      )
        return;
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
        !e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !(e.target as Element)?.closest?.(
          "button,summary,[data-disclosure],.dock-tools",
        ) &&
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
      if (
        prefs.workspace === "compose" &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        e.shiftKey ? editor.redo() : editor.undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    prefs.workspace,
    prefs.nextKey,
    prefs.previousKey,
    document,
    dialog,
    transferReview,
    conflict,
    turn,
  ]);
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
  const notationView = prefs.notationView;
  const shownNotations = notationKinds(notationView, hasTab);
  const canRender = s.scoreStatus === "ready" && !!s.alphaApi;
  const canPlay = canRender && s.playerReady;
  const composing = prefs.workspace === "compose" && !document;
  const toggleCompactPanel = (panel: "palette" | "notes" | "score") =>
    setCompactPanel((current) => (current === panel ? null : panel));
  if (!ready)
    return <main className="loading">Opening your local music library…</main>;
  return (
    <div
      ref={root}
      className="workbench"
      data-theme="dark"
      data-workspace={prefs.workspace}
    >
      <header className="studio-header">
        <div className="studio-global">
          <button
            type="button"
            className="studio-brand"
            onClick={() => preference("workspace", "library")}
            aria-label="Engraver library"
          >
            <Image src="/icon.svg" alt="" width={34} height={34} priority />
            <strong>Engraver</strong>
          </button>
          <nav aria-label="Workspaces">
            {(["library", "compose", "perform"] as const).map((workspace) => (
              <ActionButton
                key={workspace}
                aria-current={
                  prefs.workspace === workspace ? "page" : undefined
                }
                disabled={
                  workspace === "compose"
                    ? !s.score || !!document
                    : workspace === "perform" && !activeId
                }
                onClick={() => preference("workspace", workspace)}
              >
                {workspace[0].toUpperCase() + workspace.slice(1)}
              </ActionButton>
            ))}
          </nav>
          <div className="studio-utilities">
            <span
              role="status"
              className={`studio-save ${status === "error" ? "studio-save-error" : ""}`}
              data-status={busy ? "working" : status}
            >
              {busy
                ? "Working…"
                : status === "saving"
                  ? "Saving…"
                  : status === "error"
                    ? "Save failed"
                    : "Saved locally"}
            </span>
            <button
              type="button"
              className="studio-icon studio-theme"
              aria-label="Inverted dark mode"
              title={
                prefs.theme === "inverted"
                  ? "Switch to Carbon with normal pages"
                  : "Invert score and document pages"
              }
              aria-pressed={prefs.theme === "inverted"}
              onClick={() =>
                preference(
                  "theme",
                  prefs.theme === "inverted" ? "dark" : "inverted",
                )
              }
            >
              <Contrast size={17} aria-hidden="true" />
            </button>
            {prefs.workspace === "library" && (
              <div className="studio-disclosure" data-disclosure="library">
                <button
                  type="button"
                  id="studio-library-trigger"
                  className="studio-icon"
                  aria-label="Library actions"
                  title="Library actions"
                  aria-expanded={menuState === "library"}
                  aria-controls="studio-library-actions"
                  onClick={() =>
                    setMenuState(menuState === "library" ? null : "library")
                  }
                >
                  <Menu size={18} aria-hidden="true" />
                </button>
                {menuState === "library" && (
                  <div
                    className="studio-popup studio-export"
                    id="studio-library-actions"
                    role="group"
                    aria-label="Library actions"
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setMenuState(null);
                        setTransferReview({
                          reports: [formatReport("backup", "export")],
                          action: "Download library backup",
                          proceed: () => void run(backupLibrary),
                        });
                      }}
                    >
                      Back up library
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setMenuState(null);
                        backupInput.current?.click();
                      }}
                    >
                      Restore backup
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              id="studio-settings-trigger"
              className="studio-icon"
              aria-label="Settings"
              title="Settings"
              aria-expanded={settings}
              aria-controls={settings ? "studio-settings" : undefined}
              onClick={() => {
                setMenuState(null);
                setSettings((value) => !value);
              }}
            >
              <Settings2 size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
        {prefs.workspace !== "library" && (
          <div className="studio-scorebar">
            {document ? (
              <>
                <strong className="studio-score-title" title={document.title}>
                  {document.title}
                </strong>
                <button
                  type="button"
                  className="studio-command"
                  onClick={() => void fullscreen()}
                >
                  {full ? "Exit fullscreen" : "Fullscreen"}
                </button>
              </>
            ) : (
              s.score && (
                <>
                  <div className="studio-score-context">
                    <strong
                      className="studio-score-title"
                      title={s.score.title}
                    >
                      {s.score.title}
                    </strong>
                    <div
                      className="studio-zoom"
                      role="group"
                      aria-label="Score zoom"
                    >
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
                      <button
                        type="button"
                        aria-label="Reset score zoom to 100%"
                        title="Reset score zoom"
                        onClick={() => preference("zoom", 100)}
                      >
                        {prefs.zoom}%
                      </button>
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
                  <div
                    className="studio-score-actions"
                    role="group"
                    aria-label="Score actions"
                  >
                    {prefs.workspace === "compose" && (
                      <div
                        className="studio-history"
                        role="group"
                        aria-label="History"
                      >
                        <ActionButton
                          disabled={s.historyIndex <= 0 || conflict}
                          onClick={s.undo}
                        >
                          Undo
                        </ActionButton>
                        <ActionButton
                          disabled={
                            s.historyIndex >= s.history.length - 1 || conflict
                          }
                          onClick={s.redo}
                        >
                          Redo
                        </ActionButton>
                      </div>
                    )}
                    {composing && (
                      <ScoreCheck
                        disabled={conflict}
                        onJump={(target) => {
                          setCompactPanel(null);
                          setScoreCheckJump(target);
                        }}
                      />
                    )}
                    {composing && (
                      <button
                        type="button"
                        className="studio-command studio-desktop-settings"
                        aria-expanded={prefs.tools}
                        onClick={() => preference("tools", !prefs.tools)}
                      >
                        Score settings
                      </button>
                    )}
                    <div className="studio-disclosure" data-disclosure="view">
                      <button
                        type="button"
                        id="studio-view-trigger"
                        className="studio-command"
                        aria-expanded={menuState === "view"}
                        aria-controls="score-view-popup"
                        onClick={() =>
                          setMenuState(menuState === "view" ? null : "view")
                        }
                      >
                        View <ChevronDown size={13} aria-hidden="true" />
                      </button>
                      {menuState === "view" && (
                        <div
                          id="score-view-popup"
                          className="studio-popup studio-view"
                          role="group"
                          aria-label="Score view"
                        >
                          <div className="studio-view-controls">
                            <fieldset className="notation-switch">
                              <legend>Notation views</legend>
                              {(
                                Object.keys(notationLabels) as NotationKind[]
                              ).map((kind) => (
                                <label key={kind}>
                                  <input
                                    type="checkbox"
                                    checked={shownNotations.includes(kind)}
                                    disabled={kind === "tab" && !hasTab}
                                    onChange={(event) => {
                                      const stored =
                                        notationKinds(notationView);
                                      const next = event.target.checked
                                        ? [...new Set([...stored, kind])]
                                        : stored.filter(
                                            (value) => value !== kind,
                                          );
                                      if (
                                        next.some(
                                          (value) => value !== "tab" || hasTab,
                                        )
                                      )
                                        preference("notationView", next);
                                    }}
                                  />
                                  {notationLabels[kind]}
                                </label>
                              ))}
                            </fieldset>
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
                                  api.tickPosition =
                                    api.score.masterBars[index].start;
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
                                value={
                                  prefs.allTracks
                                    ? "all"
                                    : (s.activeTrackId ?? "")
                                }
                                onChange={(e) => {
                                  preference(
                                    "allTracks",
                                    e.target.value === "all",
                                  );
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
                              <option value="horizontal">
                                Horizontal layout
                              </option>
                            </select>
                            <button
                              className="studio-command"
                              type="button"
                              onClick={() => {
                                setMenuState(null);
                                void fullscreen();
                              }}
                            >
                              {full ? "Exit fullscreen" : "Fullscreen"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="studio-disclosure" data-disclosure="export">
                      <button
                        type="button"
                        id="studio-export-trigger"
                        className="studio-command"
                        aria-expanded={menuState === "export"}
                        aria-controls="export-popup"
                        onClick={() =>
                          setMenuState(menuState === "export" ? null : "export")
                        }
                      >
                        Export <ChevronDown size={13} aria-hidden="true" />
                      </button>
                      {menuState === "export" && (
                        <div
                          id="export-popup"
                          className="studio-popup studio-export"
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
                  </div>
                </>
              )
            )}
            {currentSet && (
              <button
                className="studio-command studio-set-next"
                type="button"
                onClick={nextSetItem}
              >
                Next in setlist
              </button>
            )}
          </div>
        )}
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
        <section
          id="studio-settings"
          className="settings-panel"
          aria-labelledby="studio-settings-title"
        >
          <h2 id="studio-settings-title">Appearance & device</h2>
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
                ["light", "White"],
                ["dark", "Carbon dark"],
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
            busy={busy}
            onNewScore={async (template) => {
              const title = await askText("Score title", "Untitled");
              if (title === null) return;
              const score = blankScore(
                title.trim() || "Untitled",
                template === "guitar" ? "guitar" : "piano",
                8,
              );
              const track = score.tracks[0];
              if (template === "lead") track.name = "Melody";
              if (template === "piano") {
                track.additionalStaves = [
                  {
                    measures: blankScore("", "piano", 8).tracks[0].measures.map(
                      (measure) => ({ ...measure, clef: "bass" }),
                    ),
                  },
                ];
              }
              void run(() => open(score));
            }}
            onImport={() => importInput.current?.click()}
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
            <div
              className="editor-layout studio-editor"
              data-compact-panel={compactPanel ?? undefined}
              data-score-settings={prefs.tools || undefined}
            >
              {composing && (
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
              {composing && (prefs.tools || compactPanel === "score") && (
                <fieldset
                  className="tools-container"
                  style={{ width: prefs.panelWidth }}
                  onPointerUp={(e) => {
                    if (
                      !window.matchMedia(
                        "(min-width: 1001px) and (min-height: 561px)",
                      ).matches
                    )
                      return;
                    const width = e.currentTarget.clientWidth;
                    if (Math.abs(width - prefs.panelWidth) > 2)
                      preference("panelWidth", width);
                  }}
                  disabled={conflict}
                >
                  <div className="studio-tools-heading">
                    <strong>Score settings</strong>
                    <button
                      className="studio-command"
                      type="button"
                      onClick={() => {
                        setCompactPanel(null);
                        preference("tools", false);
                      }}
                    >
                      Done
                    </button>
                  </div>
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
                    key={s.score?.id}
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
                    reveal={scoreCheckJump}
                  />
                )}
              </div>
              {composing && <NoteInspector disabled={conflict} />}
            </div>
            {composing && (
              <div
                className="studio-edit-controls"
                role="group"
                aria-label="Editing panels"
              >
                {(
                  [
                    ["palette", "Palette"],
                    ["notes", "Note details"],
                    ["score", "Score settings"],
                  ] as const
                ).map(([panel, label]) => (
                  <button
                    type="button"
                    key={panel}
                    className="studio-command studio-compact-settings"
                    aria-expanded={compactPanel === panel}
                    onClick={() => toggleCompactPanel(panel)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {!document && (
              <PerformanceTransport
                key={s.score?.id}
                perform={prefs.workspace === "perform"}
                blocked={conflict}
                canPlay={canPlay}
                prefs={prefs}
                loop={loop}
                loopStart={loopStart}
                focusRange={focusRange}
                setLoop={setLoop}
                setLoopStart={setLoopStart}
                setFocusRange={setFocusRange}
                onPreferenceChange={preference}
                onTurn={turn}
              />
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
        <dialog
          ref={promptDialog}
          className="modal studio-prompt"
          aria-labelledby="studio-prompt-title"
          onCancel={() => {
            dialog.resolve(null);
            setDialog(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              dialog.resolve(dialogText);
              setDialog(null);
            }}
          >
            <h2 id="studio-prompt-title">{dialog.title}</h2>
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
        </dialog>
      )}
    </div>
  );
}
