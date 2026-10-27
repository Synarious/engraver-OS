"use client";
import { SidebarMode } from "../../utils/sidebarMode";
import { memo, useRef, useState } from "react";
import { ExtendedPalette } from "./ExtendedPalette";
import { NotationDetails } from "./NotationDetails";
import { ActionButton } from "./ActionButton";
import { useEditorStore } from "../../store/editorStore";
import {
  scoreBeats,
  locateBeat,
  pitchName,
  SelectionPatch,
} from "../../utils/scoreSelection";
function NumericField({
  label,
  value,
  min,
  max,
  disabled = false,
  commit,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  disabled?: boolean;
  commit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(""),
    [editing, setEditing] = useState(false),
    cancel = useRef(false);
  return (
    <label className="note-number-field">
      {label}
      <input
        aria-label={label}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        disabled={disabled}
        value={editing ? draft : (value ?? "")}
        placeholder="Mixed"
        onFocus={() => {
          setDraft(value === null ? "" : String(value));
          setEditing(true);
          cancel.current = false;
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (!cancel.current && draft.trim() !== "" && Number(draft) !== value)
            commit(Number(draft));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.stopPropagation();
            cancel.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
export const NoteInspector = memo(function NoteInspector({
  disabled = false,
  palette = false,
  sidebarMode = "both",
  onSidebarModeChange,
}: {
  disabled?: boolean;
  palette?: boolean;
  sidebarMode?: SidebarMode;
  onSidebarModeChange?: (mode: SidebarMode) => void;
}) {
  const s = useEditorStore(),
    [pitch, setPitch] = useState(64),
    [entryString, setEntryString] = useState(0),
    [entryFret, setEntryFret] = useState(0),
    [collapsed, setCollapsed] = useState(false);
  const entries = s.score ? scoreBeats(s.score) : [],
    selected = entries.flatMap((e) =>
      e.beat.notes
        .filter((n) => s.selectedNoteIds.includes(n.id))
        .map((n) => ({ note: n, ...e })),
    ),
    beats = entries.filter((e) => s.selectedBeatIds.includes(e.beat.id)),
    track = s.score?.tracks.find((t) => t.id === s.activeTrackId);
  const active = locateBeat(
      s.score,
      s.activeBeatId && s.activeTrackId
        ? {
            trackId: s.activeTrackId,
            staffIndex: s.activeStaffIndex,
            measureIndex: s.activeMeasureIndex,
            voiceIndex: s.activeVoiceIndex,
            beatId: s.activeBeatId,
            noteId: s.activeNoteId,
          }
        : null,
    ),
    tuning = active?.tuning ?? track?.tuning;
  const mixed = <T,>(values: T[]) =>
    values.length && values.every((v) => v === values[0]) ? values[0] : null;
  const run = (operation: () => void) => {
    try {
      s.setSelectionError(null);
      operation();
    } catch (error) {
      s.setSelectionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  };
  const patch = (change: SelectionPatch) =>
    run(() => s.updateSelection(change));
  const allFretted =
      !!selected.length &&
      selected.every((e) => e.tuning?.length && e.note.string !== undefined),
    strings = allFretted
      ? Math.min(...selected.map((e) => e.tuning!.length))
      : (tuning?.length ?? 0);
  const single = selected.length === 1 ? selected[0].note : null,
    duration = mixed(beats.map((e) => e.beat.duration)),
    dynamics = mixed(beats.map((e) => e.beat.dynamics ?? "mf"));
  const beatCount = beats.length,
    canEdit = beatCount > 0;
  return (
    <fieldset
      className={`note-inspector ${palette ? "notation-palette" : "property-inspector"} ${collapsed ? "inspector-collapsed" : ""} ${canEdit ? "has-selection" : ""}`}
      disabled={disabled || (palette && !canEdit)}
    >
      {palette && (
        <legend className="palette-mode-legend">
          <span className="eyebrow">PALETTE</span>
          <div
            className="palette-mode-switch"
            role="group"
            aria-label="Sidebar tools"
          >
            {(["guitar", "staff", "both"] as const).map((mode) => (
              <ActionButton
                key={mode}
                disabled={disabled}
                aria-label={`${mode[0].toUpperCase() + mode.slice(1)} sidebar tools`}
                title={`Show ${mode === "both" ? "guitar and staff" : mode} tools in the sidebar`}
                aria-pressed={sidebarMode === mode}
                onClick={() => onSidebarModeChange?.(mode)}
              >
                {mode}
              </ActionButton>
            ))}
          </div>
        </legend>
      )}
      <div className="inspector-heading">
        <div>
          <span className="eyebrow">
            {palette ? "NOTE INPUT" : "INSPECTOR"}
          </span>
          <h2>
            {palette
              ? "Notation"
              : selected.length > 1
                ? `${selected.length} notes`
                : single
                  ? pitchName(single.pitch)
                  : canEdit
                    ? `${beatCount === 1 ? "Beat" : `${beatCount} beats`}`
                    : "Choose a note"}
          </h2>
        </div>
        <ActionButton
          className="inspector-collapse"
          aria-label={
            collapsed ? "Expand note inspector" : "Collapse note inspector"
          }
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "Edit" : "⌄"}
        </ActionButton>
      </div>
      {canEdit && (
        <p className="selection-location">
          Measure {s.activeMeasureIndex + 1} · Staff {s.activeStaffIndex + 1} ·
          Voice {s.activeVoiceIndex + 1}
          {beatCount > 1 ? ` · ${beatCount} beats` : ""}
        </p>
      )}
      <div className="inspector-body">
        {s.selectionError && (
          <p className="selection-error" role="alert">
            {s.selectionError}
          </p>
        )}
        {!canEdit && (
          <div className="selection-empty">
            <p>Click or tap a note or rest on the score.</p>

            <ActionButton onClick={() => s.moveSelection(1)}>
              Select first beat
            </ActionButton>
          </div>
        )}
        <div className="selection-actions">
          <ActionButton
            aria-pressed={s.multiSelect}
            onClick={() => s.setMultiSelect(!s.multiSelect)}
          >
            Multi-select
          </ActionButton>
          <ActionButton disabled={!canEdit} onClick={s.clearSelection}>
            Clear
          </ActionButton>
          <ActionButton
            disabled={!active?.beat.notes.length}
            onClick={s.selectChord}
          >
            Chord
          </ActionButton>
          <ActionButton disabled={!track} onClick={s.selectMeasure}>
            Measure
          </ActionButton>
        </div>
        {(canEdit || palette) && (
          <>
            <section className="palette-rhythm" data-tone="blue">
              <h3>Note values</h3>
              <div
                className="duration-palette"
                role="group"
                aria-label="Note duration"
              >
                {(
                  [
                    ["w", "Whole"],
                    ["h", "Half"],
                    ["q", "Quarter"],
                    ["e", "Eighth"],
                    ["s", "16th"],
                    ["t", "32nd"],
                    ["x", "64th"],
                    ["y", "128th"],
                  ] as const
                ).map(([value, name]) => (
                  <ActionButton
                    key={value}
                    aria-label={`${name} note`}
                    title={`${name} note duration`}
                    aria-pressed={duration === value}
                    onClick={() => patch({ duration: value })}
                  />
                ))}
              </div>
              <div className="note-control-row">
                <ActionButton
                  aria-pressed={canEdit && beats.every((e) => e.beat.isDotted)}
                  onClick={() =>
                    patch({ dotted: !beats.every((e) => e.beat.isDotted) })
                  }
                >
                  Dotted
                </ActionButton>
                <ActionButton
                  aria-pressed={
                    canEdit &&
                    beats.every(
                      (e) =>
                        e.beat.isTuplet &&
                        (e.beat.tuplet?.[0] ?? 3) === 3 &&
                        (e.beat.tuplet?.[1] ?? 2) === 2,
                    )
                  }
                  onClick={() =>
                    patch(
                      beats.every(
                        (e) =>
                          e.beat.isTuplet &&
                          (e.beat.tuplet?.[0] ?? 3) === 3 &&
                          (e.beat.tuplet?.[1] ?? 2) === 2,
                      )
                        ? { tuplet: false }
                        : { tupletRatio: [3, 2] },
                    )
                  }
                >
                  Triplet
                </ActionButton>
                <ActionButton onClick={() => run(s.restSelection)}>
                  Rest
                </ActionButton>
              </div>
            </section>
            {!!selected.length && (
              <section className="selection-pitch">
                <h3>{allFretted ? "Pitch & fret" : "Pitch"}</h3>
                <div className="note-control-row">
                  <ActionButton
                    aria-label="Lower pitch one semitone"
                    onClick={() => patch({ semitones: -1 })}
                  >
                    −1
                  </ActionButton>
                  <strong>
                    {single ? pitchName(single.pitch) : "Transpose selection"}
                  </strong>
                  <ActionButton
                    aria-label="Raise pitch one semitone"
                    onClick={() => patch({ semitones: 1 })}
                  >
                    +1
                  </ActionButton>
                </div>
                <div className="note-control-row">
                  <ActionButton onClick={() => patch({ semitones: -12 })}>
                    − Octave
                  </ActionButton>
                  <ActionButton onClick={() => patch({ semitones: 12 })}>
                    + Octave
                  </ActionButton>
                </div>
                <NumericField
                  label="MIDI pitch"
                  value={single?.pitch ?? null}
                  min={0}
                  max={127}
                  disabled={!single}
                  commit={(pitch) => patch({ pitch })}
                />
                {allFretted && (
                  <>
                    <NumericField
                      label="Fret"
                      value={mixed(selected.map((e) => e.note.fret ?? 0))}
                      min={0}
                      max={36}
                      commit={(fret) => patch({ fret })}
                    />
                    <label>
                      String
                      <select
                        aria-label="Selected string"
                        value={mixed(selected.map((e) => e.note.string)) ?? ""}
                        onChange={(e) =>
                          patch({ string: Number(e.target.value) })
                        }
                      >
                        <option value="" disabled>
                          Mixed
                        </option>
                        {Array.from({ length: strings }, (_, i) => (
                          <option key={i} value={i}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </section>
            )}
            <section className="palette-expression" data-tone="amber">
              <h3>Expression</h3>
              <div
                className="dynamic-palette"
                role="group"
                aria-label="Dynamics"
              >
                {(
                  ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"] as const
                ).map((d) => (
                  <ActionButton
                    key={d}
                    aria-label={`Dynamics ${d}`}
                    title={`Dynamics: ${d}`}
                    aria-pressed={canEdit && dynamics === d}
                    onClick={() => patch({ dynamics: d })}
                  />
                ))}
              </div>
              <div className="selection-actions">
                {(["accent", "staccato", "palmMute", "letRing"] as const)
                  .filter(
                    (key) =>
                      (allFretted && (!palette || sidebarMode !== "staff")) ||
                      !["palmMute", "letRing"].includes(key),
                  )
                  .map((key) => (
                    <ActionButton
                      key={key}
                      disabled={!selected.length}
                      aria-pressed={
                        selected.length > 0 &&
                        selected.every((e) => e.note.articulations?.[key])
                      }
                      onClick={() =>
                        patch({
                          [key]: !selected.every(
                            (e) => e.note.articulations?.[key],
                          ),
                        })
                      }
                    >
                      {
                        {
                          accent: "Accent",
                          staccato: "Staccato",
                          palmMute: "Palm mute",
                          letRing: "Let ring",
                        }[key]
                      }
                    </ActionButton>
                  ))}
                <ActionButton
                  disabled={!selected.length}
                  aria-pressed={
                    selected.length > 0 && selected.every((e) => e.note.isTied)
                  }
                  onClick={() =>
                    patch({ tied: !selected.every((e) => e.note.isTied) })
                  }
                >
                  Tie
                </ActionButton>
              </div>
            </section>
            <section className="selection-edit">
              <h3>Edit selection</h3>
              <div className="selection-actions">
                <ActionButton
                  disabled={!selected.length}
                  onClick={s.copySelection}
                >
                  Copy
                </ActionButton>
                <ActionButton
                  disabled={!s.noteClipboard.length}
                  onClick={() => run(s.pasteSelection)}
                >
                  Paste
                </ActionButton>
                <ActionButton
                  className="danger-button"
                  disabled={!selected.length}
                  onClick={() => run(s.deleteSelection)}
                >
                  Delete notes
                </ActionButton>
              </div>
              <div className="note-control-row">
                <ActionButton onClick={() => s.moveSelection(-1)}>
                  ← Previous beat
                </ActionButton>
                <ActionButton onClick={() => s.moveSelection(1)}>
                  Next beat →
                </ActionButton>
              </div>
            </section>
          </>
        )}
        {palette && <ExtendedPalette mode={sidebarMode} />}
        {!palette && (
          <div className="advanced-note-details">
            <NotationDetails />
          </div>
        )}
        <details className="insert-note-panel" open={!canEdit}>
          <summary>Add a note</summary>
          {tuning?.length ? (
            <>
              <NumericField
                label="New fret"
                value={entryFret}
                min={0}
                max={36}
                commit={setEntryFret}
              />
              <label>
                New string
                <select
                  value={entryString}
                  onChange={(e) => setEntryString(Number(e.target.value))}
                >
                  {tuning.map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <NumericField
              label="New pitch"
              value={pitch}
              min={0}
              max={127}
              commit={setPitch}
            />
          )}
          <ActionButton
            disabled={!track}
            className="primary"
            onClick={() =>
              run(() =>
                s.insertSelectionNote(
                  pitch,
                  Math.min(entryString, (tuning?.length ?? 1) - 1),
                  entryFret,
                ),
              )
            }
          >
            Add note to beat
          </ActionButton>
        </details>
        <details className="editing-help">
          <summary>Keyboard shortcuts</summary>
          <p>
            Enter or leave a number field to apply. On the score: ←/→ move, ↑/↓
            change pitch, Shift+↑/↓ change octave, Delete removes notes.
          </p>
        </details>
      </div>
    </fieldset>
  );
});
