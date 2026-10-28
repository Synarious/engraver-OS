"use client";
import { Children, useId, useState, type ButtonHTMLAttributes } from "react";
import { NotationSymbol, hasNotationSymbol } from "./NotationSymbol";
import { createPortal } from "react-dom";
import {
  Library,
  PencilLine,
  Headphones,
  Presentation,
  Settings2,
  FilePlus2,
  Import,
  Archive,
  FolderOpen,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  Guitar,
  Music2,
  PanelsTopLeft,
  BookmarkPlus,
  SlidersHorizontal,
  Square,
  Play,
  Pause,
  Repeat2,
  Copy,
  ClipboardPaste,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MousePointer2,
  Layers2,
  X,
  ListMusic,
  Plus,
  Minus,
  CircleDot,
  AudioLines,
  CornerDownRight,
  VolumeX,
  Volume2,
  FlagTriangleRight,
  FlagTriangleLeft,
  Contrast,
  type LucideIcon,
} from "lucide-react";

const icons: Partial<Record<string, LucideIcon>> = {
  Library,
  Compose: PencilLine,
  Practice: Headphones,
  Perform: Presentation,
  Settings: Settings2,
  "Inverted dark mode": Contrast,
  "+ New score": FilePlus2,
  "Import music": Import,
  "Back up library": Archive,
  "Restore backup": FolderOpen,
  Undo: Undo2,
  Redo: Redo2,
  Fullscreen: Maximize2,
  "Exit fullscreen": Minimize2,
  "Guitar sidebar tools": Guitar,
  "Staff sidebar tools": Music2,
  "Both sidebar tools": PanelsTopLeft,
  Tab: Guitar,
  Staff: Music2,
  Combined: PanelsTopLeft,
  "Bookmark measure": BookmarkPlus,
  "Score settings": SlidersHorizontal,
  Stop: Square,
  Play,
  Pause,
  Loop: Repeat2,
  "Mark A": FlagTriangleRight,
  "Mark B": FlagTriangleLeft,
  "Clear A–B": X,
  "Focus start": FlagTriangleLeft,
  "Focus end": FlagTriangleRight,
  "Focus reset": X,
  Copy,
  Paste: ClipboardPaste,
  "Delete notes": Trash2,
  "← Previous beat": ChevronLeft,
  "Next beat →": ChevronRight,
  "Multi-select": MousePointer2,
  Clear: X,
  Chord: Layers2,
  Measure: ListMusic,
  "Add note to beat": Plus,
  "Select first beat": MousePointer2,
  "Lower pitch one semitone": Minus,
  "Raise pitch one semitone": Plus,
  "− Octave": ChevronDown,
  "+ Octave": ChevronUp,
  "Collapse note inspector": ChevronDown,
  "Expand note inspector": PencilLine,
  Dotted: CircleDot,
  Triplet: AudioLines,
  Rest: Music2,
  Accent: ChevronRight,
  Staccato: CircleDot,
  "Palm mute": VolumeX,
  "Let ring": Volume2,
  Tie: CornerDownRight,
};
const help: Record<string, string> = {
  Undo: "Undo · Ctrl/⌘ Z",
  Redo: "Redo · Ctrl/⌘ Shift Z",
  Play: "Play · Space",
  Pause: "Pause · Space",
  Stop: "Stop playback",
  "Focus start": "Set focus start at the current position",
  "Focus end": "Set focus end and repeat the passage",
  "Focus reset": "Clear the focus passage and loop",
  "Mark A": "Mark loop start (A)",
  "Mark B": "Mark loop end (B)",
  "Clear A–B": "Clear the loop range",
  Copy: "Copy selected notes · Ctrl/⌘ C",
  Paste: "Paste notes into the active beat · Ctrl/⌘ V",
  "Delete notes": "Delete selected notes · Delete",
  Clear: "Clear selection · Esc",
  "Multi-select": "Add or remove notes from selection · Ctrl/⌘ click",
  Chord: "Select every note in the active chord",
  Measure: "Select the active measure",
  Dotted: "Toggle dotted duration",
  Triplet: "Toggle triplet rhythm",
  Rest: "Replace the selected beats with rests",
  "− Octave": "Lower one octave · Shift ↓",
  "+ Octave": "Raise one octave · Shift ↑",
  "Lower pitch one semitone": "Lower pitch · ↓",
  "Raise pitch one semitone": "Raise pitch · ↑",
  "← Previous beat": "Previous beat · ←",
  "Next beat →": "Next beat · →",
  "Bookmark measure": "Bookmark the current measure",
  "Score settings": "Instrument, time signature, tuning, and score settings",
};
const commandTones: Record<string, string> = {
  Library: "blue",
  Compose: "blue",
  Practice: "green",
  Perform: "violet",
  Play: "green",
  Pause: "green",
  Loop: "green",
  "Mark A": "green",
  "Mark B": "green",
  "Guitar sidebar tools": "teal",
  "Staff sidebar tools": "blue",
  "Both sidebar tools": "violet",
  Tab: "teal",
  Staff: "blue",
  Combined: "violet",
  Copy: "blue",
  Paste: "blue",
  "Delete notes": "red",
  "Import music": "blue",
  "+ New score": "blue",
};
const labeledNavigation = new Set([
  "Library",
  "Compose",
  "Practice",
  "Perform",
  "Play",
  "Pause",
  "Stop",
]);

/** Shared accessible command button. Portal tooltips remain visible above scrolling toolbars. */
export function ActionButton({
  children,
  title,
  className = "",
  onFocus,
  onBlur,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onKeyDown,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const text = Children.toArray(children)
    .filter((v) => typeof v === "string" || typeof v === "number")
    .join("")
    .trim();
  const label = props["aria-label"] || text;
  const Icon = icons[label];
  const musical = hasNotationSymbol(label);
  const hasIcon = !!Icon || musical;
  const iconOnly = hasIcon && !labeledNavigation.has(label);
  const tooltip = title || help[label] || label;
  const id = useId();
  const [position, setPosition] = useState<{
    x: number;
    y: number;
    above: boolean;
  } | null>(null);
  function show(element: HTMLButtonElement) {
    const rect = element.getBoundingClientRect();
    setPosition({
      x: Math.max(
        125,
        Math.min(window.innerWidth - 125, rect.left + rect.width / 2),
      ),
      y: rect.bottom + 9,
      above: rect.bottom > window.innerHeight - 90,
    });
  }
  return (
    <>
      <button
        {...props}
        data-command-tone={commandTones[label]}
        aria-label={props["aria-label"] || (hasIcon ? label : undefined)}
        aria-describedby={position ? id : undefined}
        className={`${className} ${hasIcon ? "command-button" : ""} ${iconOnly ? "icon-only" : ""}`.trim()}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") show(e.currentTarget);
          onPointerEnter?.(e);
        }}
        onPointerLeave={(e) => {
          setPosition(null);
          onPointerLeave?.(e);
        }}
        onPointerDown={(e) => {
          setPosition(null);
          onPointerDown?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setPosition(null);
          onKeyDown?.(e);
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) show(e.currentTarget);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setPosition(null);
          onBlur?.(e);
        }}
      >
        {musical ? (
          <NotationSymbol label={label} />
        ) : Icon ? (
          <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        ) : null}
        {!iconOnly &&
          (Icon ? <span className="command-label">{children}</span> : children)}
      </button>
      {position &&
        tooltip &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="command-tooltip"
            style={{
              left: position.x,
              top: position.above ? undefined : position.y,
              bottom: position.above
                ? window.innerHeight - position.y + 34
                : undefined,
            }}
          >
            {tooltip}
          </div>,
          document.body,
        )}
    </>
  );
}
