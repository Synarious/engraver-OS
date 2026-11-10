"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import type { NoteAST } from "../../types/score";
import {
  chordTypes,
  chordVoicings,
  guitarTuning,
  isDiagramTuning,
  maxFret,
  pianoMajorFingerings,
  resizeTuning,
  rootLabel,
  roots,
  scales,
  isScaleDiagram,
  type ScaleName,
} from "../../utils/harmonyLibrary";
import {
  locateBeat,
  pitchName,
  staffMeasures,
  staffTuning,
  type ScoreLocation,
} from "../../utils/scoreSelection";
import { ChordShape, ScaleFretboard } from "./HarmonyDiagrams";

export function HarmonyLibrary() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="harmony-trigger"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <BookOpen size={16} aria-hidden="true" /> Chords &amp; scales
      </button>
      {open && <HarmonyDialog onClose={() => setOpen(false)} />}
    </>
  );
}

type Mode = "Chords" | "Scales" | "Piano fingering";
const modeNames: Mode[] = ["Chords", "Scales", "Piano fingering"];
function HarmonyDialog({ onClose }: { onClose: () => void }) {
  const s = useEditorStore();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const location: ScoreLocation | null =
    s.activeTrackId && s.activeBeatId
      ? {
          trackId: s.activeTrackId,
          staffIndex: s.activeStaffIndex,
          measureIndex: s.activeMeasureIndex,
          voiceIndex: s.activeVoiceIndex,
          beatId: s.activeBeatId,
          noteId: s.activeNoteId,
        }
      : null;
  const track = s.score?.tracks.find((t) => t.id === s.activeTrackId);
  const staff = s.activeStaffIndex
    ? track?.additionalStaves?.[s.activeStaffIndex - 1]
    : track;
  const staffSource = s.activeStaffIndex
    ? staff?.source
    : track?.source?.staves?.[0];
  const target = locateBeat(s.score, location);
  const activeTuning = track && staffTuning(track, s.activeStaffIndex);
  const savedScale = isScaleDiagram(target?.beat.scaleDiagram)
    ? target.beat.scaleDiagram
    : null;
  const savedChord = target?.beat.chord;
  const chordMatch = savedChord?.name
    .replaceAll("♭", "b")
    .replaceAll("♯", "#")
    .match(/^([A-G][b#]?)(.*)$/);
  const savedRoot = chordMatch ? roots.indexOf(chordMatch[1]) : -1;
  const savedQuality = chordMatch
    ? chordTypes.findIndex((type) => type[1] === chordMatch[2])
    : -1;
  const piano =
    track?.type === "piano" &&
    track.midiProgram >= 0 &&
    track.midiProgram <= 7 &&
    !activeTuning?.length;
  const [mode, setMode] = useState<Mode>(
    savedScale ? "Scales" : piano ? "Piano fingering" : "Chords",
  );
  const [tuning, setTuning] = useState(() => [
    ...(savedScale?.tuning ??
      (isDiagramTuning(activeTuning) ? activeTuning : guitarTuning)),
  ]);
  const [root, setRoot] = useState(savedScale?.root ?? Math.max(0, savedRoot));
  const [quality, setQuality] = useState(Math.max(0, savedQuality));
  const [shapeIndex, setShapeIndex] = useState<number | null>(null);
  const [scale, setScale] = useState<ScaleName>(savedScale?.scale ?? "Major");
  const [firstFret, setFirstFret] = useState(savedScale?.firstFret ?? 0);
  const [lastFret, setLastFret] = useState(savedScale?.lastFret ?? maxFret);
  const existingHand =
    target?.note?.pianoFingering?.hand ??
    (target?.note?.source?.righthandfinger >= 0
      ? "right"
      : target?.note?.source?.lefthandfinger >= 0 || s.activeStaffIndex > 0
        ? "left"
        : "right");
  const [hand, setHand] = useState<"left" | "right">(existingHand);
  const [message, setMessage] = useState("");
  const chordType = chordTypes[quality];
  const chordName = roots[root] + chordType[1];
  const shapes = useMemo(
    () =>
      mode === "Chords"
        ? chordVoicings(tuning, root, chordType[2], firstFret, lastFret)
        : [],
    [mode, tuning, root, chordType, firstFret, lastFret],
  );
  const selectedShape =
    shapeIndex ??
    Math.max(
      0,
      shapes.findIndex(
        (item) => item.strings.join(",") === savedChord?.strings?.join(","),
      ),
    );
  const shape = shapes[selectedShape] ?? shapes[0];
  const matchingTuning =
    activeTuning?.length === tuning.length &&
    activeTuning.every((pitch, i) => pitch === tuning[i]);
  const emptyFrettedStaff =
    !!activeTuning?.length &&
    !!staff?.measures.every((measure) =>
      measure.voices.every((voice) =>
        voice.beats.every(
          (beat) => !beat.notes.length && !beat.chord?.strings?.length,
        ),
      ),
    );
  const diagram = { root, scale, tuning, firstFret, lastFret };
  const canAttach =
    !!target && !(target.beat.isEmpty ?? target.beat.source?.isempty);
  const editBeat = (
    edit: (entry: NonNullable<ReturnType<typeof locateBeat>>) => void,
  ) => {
    s.editScore((score) => {
      const entry = locateBeat(score, location);
      if (!entry) throw new Error("The selected beat is no longer available.");
      edit(entry);
    });
  };
  const perform = (message: string, edit: () => void) => {
    try {
      edit();
      setMessage(message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const notesWithFinger = [...scales.Major, 12].map((interval, i) => ({
    pitch: 60 + root + interval,
    finger: Number(pianoMajorFingerings[root][hand === "right" ? 0 : 1][i]),
  }));
  const updateFinger = (note: NoteAST, finger: number) => {
    if (note.source) {
      delete note.source.lefthandfinger;
      delete note.source.righthandfinger;
    }
    if (finger) note.pianoFingering = { hand, finger };
    else delete note.pianoFingering;
  };
  const noteFinger =
    target?.note?.pianoFingering?.hand === hand
      ? target.note.pianoFingering.finger
      : target?.note?.pianoFingering
        ? 0
        : Number(
            target?.note?.source?.[
              hand === "left" ? "lefthandfinger" : "righthandfinger"
            ] ?? -1,
          ) + 1;
  const usePattern = () => {
    if (!location) return;
    const ids = new Set(s.selectedNoteIds);
    s.editScore((score) => {
      const t = score.tracks.find((t) => t.id === location.trackId)!;
      const beats = staffMeasures(t, location.staffIndex).flatMap(
        (m) => m.voices[location.voiceIndex]?.beats ?? [],
      );
      const start = beats.findIndex((beat) =>
        beat.notes.some((n) => ids.has(n.id)),
      );
      const range = start >= 0 ? beats.slice(start, start + 8) : [];
      const notes = range.flatMap((beat) => beat.notes);
      const ascending = notes[0]?.pitch < notes.at(-1)?.pitch!;
      const pattern = ascending
        ? notesWithFinger
        : notesWithFinger.slice().reverse();
      if (
        ids.size !== 8 ||
        range.length !== 8 ||
        range.some((beat) => beat.notes.length !== 1) ||
        notes.some(
          (n, i) =>
            !ids.has(n.id) ||
            n.pitch - notes[0].pitch !== pattern[i].pitch - pattern[0].pitch,
        ) ||
        notes[0].pitch % 12 !== root
      )
        throw new Error(
          "Select eight consecutive single notes forming one octave of the chosen major scale.",
        );
      notes.forEach((note, i) => updateFinger(note, pattern[i].finger));
    });
  };
  return (
    <dialog
      ref={dialog}
      className="harmony-dialog"
      aria-labelledby="harmony-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="harmony-heading">
        <div>
          <h2 id="harmony-title">Chord &amp; scale library</h2>
          <p>
            {target && location
              ? `${target.track.name} · Measure ${location.measureIndex + 1} · Staff ${location.staffIndex + 1}`
              : "Choose a beat to add a chord or scale to the score."}
          </p>
        </div>
        <button type="button" aria-label="Close library" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="harmony-tabs" role="group" aria-label="Library section">
        {modeNames.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={name === mode}
            onClick={() => {
              setMode(name);
              setMessage("");
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="harmony-body">
        <div className="harmony-controls">
          <label>
            {mode === "Chords" ? "Root" : "Key"}{" "}
            <select
              value={root}
              onChange={(event) => {
                setRoot(Number(event.target.value));
                setShapeIndex(0);
              }}
            >
              {roots.map((name, i) => (
                <option key={name} value={i}>
                  {rootLabel(i)}
                </option>
              ))}
            </select>
          </label>
          {mode === "Chords" && (
            <label>
              Quality{" "}
              <select
                value={quality}
                onChange={(event) => {
                  setQuality(Number(event.target.value));
                  setShapeIndex(0);
                }}
              >
                {chordTypes.map(([name], i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "Scales" && (
            <label>
              Scale{" "}
              <select
                value={scale}
                onChange={(event) => setScale(event.target.value as ScaleName)}
              >
                {Object.keys(scales).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
          {mode === "Piano fingering" && (
            <label>
              Hand{" "}
              <select
                value={hand}
                onChange={(event) =>
                  setHand(event.target.value as "left" | "right")
                }
              >
                <option value="right">Right hand</option>
                <option value="left">Left hand</option>
              </select>
            </label>
          )}
          {mode !== "Piano fingering" && (
            <>
              <label>
                From fret{" "}
                <select
                  value={firstFret}
                  onChange={(event) => {
                    setFirstFret(Number(event.target.value));
                    setShapeIndex(0);
                  }}
                >
                  {Array.from({ length: lastFret + 1 }, (_, fret) => (
                    <option key={fret} value={fret}>
                      {fret || "Open"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To fret{" "}
                <select
                  value={lastFret}
                  onChange={(event) => {
                    setLastFret(Number(event.target.value));
                    setShapeIndex(0);
                  }}
                >
                  {Array.from(
                    { length: maxFret - firstFret + 1 },
                    (_, i) => firstFret + i,
                  ).map((fret) => (
                    <option key={fret} value={fret}>
                      {fret || "Open"}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        {mode !== "Piano fingering" && (
          <details className="harmony-tuning" key={mode}>
            <summary>Tuning · {tuning.length} strings</summary>
            <div className="harmony-controls">
              <label>
                Strings{" "}
                <select
                  value={tuning.length}
                  onChange={(event) => {
                    setTuning(resizeTuning(tuning, Number(event.target.value)));
                    setShapeIndex(0);
                  }}
                >
                  {Array.from({ length: 8 }, (_, i) => (
                    <option key={i}>{i + 3}</option>
                  ))}
                </select>
              </label>
              {isDiagramTuning(activeTuning) && (
                <button
                  type="button"
                  disabled={matchingTuning}
                  onClick={() => {
                    setTuning([...activeTuning]);
                    setShapeIndex(0);
                  }}
                >
                  Use score tuning
                </button>
              )}
              {emptyFrettedStaff && !matchingTuning && (
                <button
                  type="button"
                  onClick={() =>
                    perform("Tuning applied to the empty staff.", () => {
                      s.editScore((score) => {
                        const t = score.tracks.find(
                          (t) => t.id === s.activeTrackId,
                        )!;
                        if (s.activeStaffIndex) {
                          const st =
                            t.additionalStaves![s.activeStaffIndex - 1];
                          st.source = {
                            ...st.source,
                            stringtuning: {
                              ...st.source?.stringtuning,
                              tunings: [...tuning],
                            },
                          };
                        } else t.tuning = [...tuning];
                      });
                    })
                  }
                >
                  Apply tuning to empty staff
                </button>
              )}
            </div>
            <div className="harmony-tuning-strings">
              {tuning.map((pitch, i) => (
                <label key={i}>
                  String {i + 1}{" "}
                  <select
                    value={pitch}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setTuning((current) =>
                        current.map((p, index) => (i === index ? value : p)),
                      );
                      setShapeIndex(0);
                    }}
                  >
                    {Array.from({ length: 128 }, (_, p) => (
                      <option key={p} value={p}>
                        {pitchName(p)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {!!staffSource?.capo && (
              <p>
                Shapes are named for the open tuning, before capo transposition.
              </p>
            )}
          </details>
        )}
        {mode === "Chords" && (
          <section className="harmony-result">
            <div>
              <h3>
                {rootLabel(root)}
                {chordType[1]} <span>{chordType[0]}</span>
              </h3>
              {shape ? (
                <>
                  <label>
                    Voicing{" "}
                    <select
                      value={Math.min(selectedShape, shapes.length - 1)}
                      onChange={(event) =>
                        setShapeIndex(Number(event.target.value))
                      }
                    >
                      {shapes.map((item, i) => (
                        <option key={item.strings.join(",")} value={i}>
                          {i + 1} ·{" "}
                          {item.strings
                            .slice()
                            .reverse()
                            .map((f) => (f < 0 ? "×" : f))
                            .join("  ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>Low string to high string. × mute · ○ open.</p>
                </>
              ) : (
                <p>
                  No complete shape fits these strings and frets. Try a wider
                  range or a simpler chord.
                </p>
              )}
              {!matchingTuning && canAttach && (
                <p>
                  Use the score tuning to add a diagram to a fretted staff. You
                  can still add the chord symbol.
                </p>
              )}
            </div>
            {shape && (
              <ChordShape
                tuning={tuning}
                strings={shape.strings}
                firstFret={shape.firstFret}
                name={chordName}
              />
            )}
          </section>
        )}
        {mode === "Scales" && (
          <section className="harmony-result harmony-scale-result">
            <h3>
              {rootLabel(root)} {scale}
            </h3>
            <p>R marks the root. Numbers show intervals from the root.</p>
            <ScaleFretboard diagram={diagram} />
          </section>
        )}
        {mode === "Piano fingering" && (
          <section className="harmony-result harmony-scale-result">
            <h3>
              {rootLabel(root)} major · {hand} hand
            </h3>
            <p>Ascending, one octave. Reverse the pattern when descending.</p>
            <div
              className="harmony-fingers"
              role="list"
              aria-label="Major scale fingering"
            >
              {notesWithFinger.map(({ pitch, finger }) => (
                <div role="listitem" key={pitch}>
                  <strong>{finger}</strong>
                  <span>{pitchName(pitch).replace(/-?\d+$/, "")}</span>
                </div>
              ))}
            </div>
            {piano && target?.note ? (
              <div
                className="harmony-controls"
                role="group"
                aria-label="Mark selected piano note"
              >
                <span>{pitchName(target.note.pitch)}:</span>
                {[1, 2, 3, 4, 5, 0].map((finger) => (
                  <button
                    type="button"
                    key={finger}
                    aria-pressed={finger === noteFinger}
                    onClick={() =>
                      perform(
                        finger ? "Fingering added." : "Fingering cleared.",
                        () =>
                          editBeat(({ note }) => {
                            if (note) updateFinger(note, finger);
                          }),
                      )
                    }
                  >
                    {finger || "Clear"}
                  </button>
                ))}
              </div>
            ) : (
              <p>Select a note on a piano staff to mark its finger.</p>
            )}
          </section>
        )}
      </div>
      <footer className="harmony-footer">
        <p role="status">{message}</p>
        <div className="harmony-controls">
          {mode === "Chords" && (
            <>
              <button
                type="button"
                disabled={!canAttach}
                onClick={() =>
                  perform("Chord symbol added.", () =>
                    editBeat(({ beat }) => {
                      beat.chord = { name: chordName };
                    }),
                  )
                }
              >
                Add symbol
              </button>
              <button
                type="button"
                className="primary"
                disabled={!canAttach || !matchingTuning || !shape}
                onClick={() =>
                  perform("Chord diagram added.", () =>
                    editBeat(({ beat }) => {
                      beat.chord = {
                        name: chordName,
                        strings: [...shape.strings],
                        firstFret: shape.firstFret,
                      };
                    }),
                  )
                }
              >
                Add diagram
              </button>
              {target?.beat.chord && (
                <button
                  type="button"
                  onClick={() =>
                    perform("Chord removed.", () =>
                      editBeat(({ beat }) => {
                        delete beat.chord;
                      }),
                    )
                  }
                >
                  Remove chord
                </button>
              )}
            </>
          )}
          {mode === "Scales" && (
            <>
              <button
                type="button"
                className="primary"
                disabled={!canAttach}
                onClick={() =>
                  perform("Scale saved in the score’s diagram section.", () =>
                    editBeat(({ beat }) => {
                      beat.scaleDiagram = { ...diagram, tuning: [...tuning] };
                    }),
                  )
                }
              >
                {target?.beat.scaleDiagram
                  ? "Replace saved scale"
                  : "Save scale to score"}
              </button>
              {target?.beat.scaleDiagram && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      requestAnimationFrame(() => {
                        const section = document.getElementById(
                          "score-scale-diagrams",
                        );
                        section?.scrollIntoView({ block: "start" });
                        section?.focus({ preventScroll: true });
                      });
                    }}
                  >
                    View saved scales
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      perform("Saved scale removed.", () =>
                        editBeat(({ beat }) => {
                          delete beat.scaleDiagram;
                        }),
                      )
                    }
                  >
                    Remove saved scale
                  </button>
                </>
              )}
            </>
          )}
          {mode === "Piano fingering" && (
            <button
              type="button"
              disabled={!piano || s.selectedNoteIds.length !== 8}
              onClick={() =>
                perform("Fingering added to the selected octave.", usePattern)
              }
            >
              Apply pattern to selected octave
            </button>
          )}
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </footer>
    </dialog>
  );
}
