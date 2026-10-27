"use client";
import { ActionButton } from "./ActionButton";
import { useEditorStore } from "../../store/editorStore";
import { scoreBeats } from "../../utils/scoreSelection";
import {
  applyNotationCommand,
  commandActive,
  notationGroups,
} from "../../utils/notationCommands";
import { askText } from "../../utils/dialog";
import { SidebarMode, paletteGroupVisible } from "../../utils/sidebarMode";
export function ExtendedPalette({ mode = "both" }: { mode?: SidebarMode }) {
  const s = useEditorStore(),
    entries = s.score ? scoreBeats(s.score) : [],
    selected = entries.filter((e) => s.selectedBeatIds.includes(e.beat.id)),
    beats = selected.map((e) => e.beat),
    notes = selected.flatMap((e) =>
      e.beat.notes.filter((n) => s.selectedNoteIds.includes(n.id)),
    ),
    measure = s.score?.tracks[0]?.measures[s.activeMeasureIndex];
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
  return (
    <div className="extended-notation">
      <section>
        <h3>Rhythm details</h3>
        <div className="notation-command-grid">
          {[2, 3].map((dots) => (
            <ActionButton
              key={dots}
              aria-label={dots === 2 ? "Double dotted" : "Triple dotted"}
              title={`${dots} augmentation dots`}
              aria-pressed={
                !!beats.length &&
                beats.every((b) => b.isDotted && b.source?.dots === dots)
              }
              onClick={() =>
                run(() =>
                  s.updateSelection({
                    dots: beats.every(
                      (b) => b.isDotted && b.source?.dots === dots,
                    )
                      ? 0
                      : dots,
                  }),
                )
              }
            />
          ))}
          <ActionButton
            aria-label="Custom tuplet"
            title="Custom tuplet ratio, such as 5:4"
            onClick={async () => {
              const ratio = await askText("Tuplet ratio (notes:time)", "5:4");
              if (ratio !== null)
                run(() => {
                  const values = ratio.split(":").map(Number);
                  if (
                    values.length !== 2 ||
                    values.some((v) => !Number.isInteger(v) || v < 1 || v > 32)
                  )
                    throw new Error(
                      "Use a ratio from 1:1 to 32:32, such as 5:4.",
                    );
                  s.updateSelection({ tupletRatio: [values[0], values[1]] });
                });
            }}
          />
          <ActionButton
            aria-label="Straight rhythm"
            title="Remove tuplet grouping"
            onClick={() => run(() => s.updateSelection({ tuplet: false }))}
          />
        </div>
      </section>
      {notationGroups
        .filter((group) => paletteGroupVisible(mode, group.name))
        .map((group) => (
          <section
            key={group.name}
            data-tone={
              ["Guitar", "Picking"].includes(group.name)
                ? "teal"
                : group.name === "Fingering"
                  ? "violet"
                  : "blue"
            }
          >
            <h3>{group.name}</h3>
            <div className="notation-command-grid">
              {group.commands.map((command) => (
                <ActionButton
                  key={command.id}
                  aria-label={command.label}
                  title={
                    command.label.includes("spelling")
                      ? `${command.label} (enharmonic display; pitch unchanged)`
                      : command.label
                  }
                  disabled={
                    ["note", "relation"].includes(command.scope) &&
                    !notes.length
                  }
                  aria-pressed={commandActive(command, notes, beats, measure)}
                  onClick={() =>
                    run(() =>
                      s.editScore((score) =>
                        applyNotationCommand(
                          score,
                          s.selectedNoteIds,
                          s.selectedBeatIds,
                          command.id,
                        ),
                      ),
                    )
                  }
                />
              ))}
            </div>
          </section>
        ))}
      {notes.length > 0 && (
        <p className="palette-hint">
          Select two notes for a slur, H/P or slide. With one note selected, the
          next matching note is used.
        </p>
      )}
    </div>
  );
}
