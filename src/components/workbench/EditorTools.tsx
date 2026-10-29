"use client";
import { useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { BeatAST, MeasureAST, ScoreAST, TrackAST } from "../../types/score";
import {
  blankScore,
  freshIds,
  rest,
  transposeNote,
  setBeatDuration,
  voiceOptions,
} from "../../utils/project";
import { NotationDetails } from "./NotationDetails";
export function EditorTools() {
  const s = useEditorStore(),
    [pitch, setPitch] = useState(60),
    [fret, setFret] = useState(0),
    [string, setString] = useState(0),
    [clipboard, setClipboard] = useState<MeasureAST[] | null>(null),
    [rangeEnd, setRangeEnd] = useState(1),
    [semitones, setSemitones] = useState(0),
    [editError, setEditError] = useState("");
  const track = s.score?.tracks.find((t) => t.id === s.activeTrackId),
    staff = s.activeStaffIndex
      ? track?.additionalStaves?.[s.activeStaffIndex - 1]
      : track;
  const measure = staff?.measures[s.activeMeasureIndex],
    voice = measure?.voices[s.activeVoiceIndex],
    beat = voice?.beats.find((b) => b.id === s.activeBeatId),
    note = beat?.notes.find((n) => n.id === s.activeNoteId);
  const edit = (
    fn: (
      score: ScoreAST,
      t: TrackAST,
      m: MeasureAST | undefined,
      b: BeatAST | undefined,
    ) => void,
  ) =>
    s.editScore((score) => {
      const t = score.tracks.find((t) => t.id === s.activeTrackId);
      if (!t) return;
      const ms = s.activeStaffIndex
          ? t.additionalStaves?.[s.activeStaffIndex - 1]?.measures
          : t.measures,
        m = ms?.[s.activeMeasureIndex],
        b = m?.voices[s.activeVoiceIndex]?.beats.find(
          (b) => b.id === s.activeBeatId,
        );
      fn(score, t, m, b);
    });
  const patchBeat = (fn: (b: BeatAST) => void) =>
    edit((_, t, m, b) => {
      if (b) fn(b);
    });
  const select = (b: BeatAST) => {
    s.setActiveBeat(b.id);
    s.setActiveNote(b.notes[0]?.id ?? null);
  };
  const addNote = (
    forcedPitch?: number,
    forcedString?: number,
    forcedFret?: number,
  ) => {
    const id = crypto.randomUUID();
    let selectedNoteId = id;
    let targetId = beat?.id;
    edit((_, t, m, b) => {
      if (!m) return;
      while (m.voices.length <= s.activeVoiceIndex)
        m.voices.push({ index: m.voices.length, beats: [rest()] });
      if (!m.voices[s.activeVoiceIndex].beats.length)
        m.voices[s.activeVoiceIndex].beats.push(rest());
      const target = b ?? m.voices[s.activeVoiceIndex].beats[0];
      if (target.isEmpty ?? target.source?.isempty)
        setBeatDuration(target, target.duration);
      const tuning = s.activeStaffIndex
        ? (t.additionalStaves?.[s.activeStaffIndex - 1]?.source?.stringtuning
            ?.tunings as number[] | undefined)
        : t.tuning;
      const inserted = {
        id,
        pitch: tuning
          ? (tuning[forcedString ?? string] ?? 60) + (forcedFret ?? fret)
          : (forcedPitch ?? pitch),
        fret: tuning ? (forcedFret ?? fret) : undefined,
        string: tuning ? (forcedString ?? string) : undefined,
        isTied: false,
      };
      const existing = target.notes.find((n) =>
        tuning ? n.string === inserted.string : n.pitch === inserted.pitch,
      );
      target.isEmpty = false;
      if (existing) {
        selectedNoteId = existing.id;
        inserted.id = existing.id;
        Object.assign(existing, inserted);
      } else target.notes.push(inserted);
      targetId = target.id;
    });
    if (targetId) s.setActiveBeat(targetId);
    s.setActiveNote(selectedNoteId);
  };
  const allStaves = (t: TrackAST) => [
    { measures: t.measures },
    ...(t.additionalStaves ?? []),
  ];
  const reindex = (score: ScoreAST) =>
    score.tracks.forEach((t) =>
      allStaves(t).forEach((st) =>
        st.measures.forEach((m, i) => (m.index = i)),
      ),
    );
  const selected = () => [
    s.activeMeasureIndex,
    Math.max(
      s.activeMeasureIndex,
      Math.min((staff?.measures.length ?? 1) - 1, rangeEnd - 1),
    ),
  ];
  if (!s.score || !track) return null;
  return (
    <aside className="editor-tools">
      {editError && (
        <p role="alert" className="error">
          {editError}
        </p>
      )}
      <details open>
        <summary>Score</summary>
        <label>
          Title{" "}
          <input
            value={s.score.title}
            onChange={(e) => s.updateScoreTitle(e.target.value)}
          />
        </label>
        <label>
          Subtitle{" "}
          <input
            value={s.score.subTitle ?? ""}
            onChange={(e) =>
              edit((score) => {
                score.subTitle = e.target.value;
              })
            }
          />
        </label>
        <label>
          Composer / artist{" "}
          <input
            value={s.score.artist ?? ""}
            onChange={(e) =>
              edit((score) => {
                score.artist = e.target.value;
              })
            }
          />
        </label>
        <label>
          Tempo{" "}
          <input
            type="number"
            min={20}
            max={400}
            value={s.score.tempo}
            onChange={(e) =>
              edit((score) => {
                score.tempo = Math.max(
                  20,
                  Math.min(400, Number(e.target.value) || 120),
                );
                if (score.tracks[0]?.measures[0])
                  score.tracks[0].measures[0].tempo = score.tempo;
              })
            }
          />
        </label>
        <label>
          Meter{" "}
          <select
            value={s.score.timeSignature.join("/")}
            onChange={(e) =>
              edit((score) => {
                score.timeSignature = e.target.value.split("/").map(Number) as [
                  number,
                  number,
                ];
                score.tracks.forEach((t) =>
                  t.measures.forEach(
                    (m) => (m.timeSignature = score.timeSignature),
                  ),
                );
              })
            }
          >
            {["2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "9/8", "12/8"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </label>
      </details>
      <details open>
        <summary>Instruments</summary>
        <label>
          Track{" "}
          <select
            value={track.id}
            onChange={(e) => s.setActiveTrack(e.target.value)}
          >
            {s.score.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Name{" "}
          <input
            value={track.name}
            onChange={(e) =>
              edit((_, t) => {
                t.name = e.target.value;
              })
            }
          />
        </label>
        <label>
          MIDI program{" "}
          <input
            type="number"
            min={0}
            max={127}
            value={track.midiProgram}
            onChange={(e) =>
              edit((_, t) => {
                t.midiProgram = Math.max(
                  0,
                  Math.min(127, Number(e.target.value)),
                );
              })
            }
          />
        </label>
        <label>
          Add instrument{" "}
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              const t = blankScore(
                "",
                e.target.value as TrackAST["type"],
                track.measures.length,
              ).tracks[0];
              s.editScore((score) => {
                score.tracks.push(t);
              });
              s.setActiveTrack(t.id);
            }}
          >
            <option value="">Choose…</option>
            {["guitar", "bass", "piano", "percussion"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="toolbar">
          <button
            disabled={s.score.tracks.length < 2}
            onClick={() => {
              const next = s.score!.tracks.find((t) => t.id !== track.id)!;
              s.editScore((score) => {
                score.tracks = score.tracks.filter((t) => t.id !== track.id);
              });
              s.setActiveTrack(next.id);
            }}
          >
            Remove
          </button>
          <button
            disabled={s.score.tracks[0].id === track.id}
            onClick={() =>
              s.editScore((score) => {
                const i = score.tracks.findIndex((t) => t.id === track.id);
                [score.tracks[i - 1], score.tracks[i]] = [
                  score.tracks[i],
                  score.tracks[i - 1],
                ];
              })
            }
          >
            Move up
          </button>
        </div>
        <label>
          Staff{" "}
          <select
            value={s.activeStaffIndex}
            onChange={(e) => s.setActiveStaff(Number(e.target.value))}
          >
            {Array.from(
              { length: 1 + (track.additionalStaves?.length ?? 0) },
              (_, i) => (
                <option value={i} key={i}>
                  {i + 1}
                </option>
              ),
            )}
          </select>
        </label>
        <button
          onClick={() =>
            edit((_, t) => {
              t.additionalStaves ??= [];
              t.additionalStaves.push({
                measures: t.measures.map((m) => ({
                  index: m.index,
                  clef: "bass",
                  voices: [
                    { index: 0, beats: [rest(), rest(), rest(), rest()] },
                  ],
                })),
              });
            })
          }
        >
          Add staff
        </button>
        {track.tuning && (
          <details>
            <summary>Tuning (MIDI pitches, high to low)</summary>
            {track.tuning.map((n, i) => (
              <label key={i}>
                String {i + 1}
                <input
                  aria-label={`String ${i + 1} tuning`}
                  type="number"
                  min={0}
                  max={127}
                  value={n}
                  onChange={(e) =>
                    s.setTrackTuning(
                      track.tuning!.map((v, j) =>
                        i === j
                          ? Math.max(0, Math.min(127, Number(e.target.value)))
                          : v,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </details>
        )}
      </details>
      <details open>
        <summary>Measures and voices</summary>
        <label>
          Measure{" "}
          <select
            value={s.activeMeasureIndex}
            onChange={(e) => {
              s.setActiveMeasure(Number(e.target.value));
              s.setActiveBeat("");
              s.setActiveNote(null);
            }}
          >
            {staff?.measures.map((m, i) => (
              <option key={i} value={i}>
                {i + 1}
                {m.rehearsal ? ` · ${m.rehearsal}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Voice{" "}
          <select
            value={s.activeVoiceIndex}
            onChange={(e) => s.setActiveVoice(Number(e.target.value))}
          >
            {voiceOptions(staff?.measures ?? [], s.activeVoiceIndex).map(
              (i) => (
                <option key={i} value={i}>
                  {i + 1}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="toolbar wrap">
          <button
            onClick={() =>
              edit((score) => {
                const i = s.activeMeasureIndex + 1;
                score.tracks.forEach((t) =>
                  allStaves(t).forEach((st) =>
                    st.measures.splice(i, 0, {
                      index: i,
                      voices: [
                        { index: 0, beats: [rest(), rest(), rest(), rest()] },
                      ],
                    }),
                  ),
                );
                reindex(score);
              })
            }
          >
            Add measure
          </button>
          <button
            disabled={(staff?.measures.length ?? 0) <= 1}
            onClick={() => {
              edit((score) => {
                score.tracks.forEach((t) =>
                  allStaves(t).forEach((st) =>
                    st.measures.splice(s.activeMeasureIndex, 1),
                  ),
                );
                reindex(score);
              });
              s.setActiveMeasure(Math.max(0, s.activeMeasureIndex - 1));
              s.setActiveBeat("");
              s.setActiveNote(null);
            }}
          >
            Delete measure
          </button>
          <button
            disabled={!s.activeMeasureIndex}
            onClick={() => {
              edit((score) => {
                score.tracks.forEach((t) =>
                  allStaves(t).forEach((st) => {
                    const i = s.activeMeasureIndex;
                    [st.measures[i - 1], st.measures[i]] = [
                      st.measures[i],
                      st.measures[i - 1],
                    ];
                  }),
                );
                reindex(score);
              });
              s.setActiveMeasure(s.activeMeasureIndex - 1);
            }}
          >
            Move measure left
          </button>
        </div>
        {measure && (
          <>
            <label>
              Clef{" "}
              <select
                value={measure.clef ?? "treble"}
                onChange={(e) =>
                  edit((_, t, m) => {
                    if (m) m.clef = e.target.value as MeasureAST["clef"];
                  })
                }
              >
                {["treble", "bass", "alto", "tenor", "tab"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Key{" "}
              <select
                value={measure.source?.keysignature ?? 0}
                onChange={(e) =>
                  edit((_, t, m) => {
                    if (m)
                      m.source = {
                        ...m.source,
                        keysignature: Number(e.target.value),
                      };
                  })
                }
              >
                {[
                  "Cb",
                  "Gb",
                  "Db",
                  "Ab",
                  "Eb",
                  "Bb",
                  "F",
                  "C",
                  "G",
                  "D",
                  "A",
                  "E",
                  "B",
                  "F#",
                  "C#",
                ].map((k, i) => (
                  <option key={k} value={i - 7}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rehearsal{" "}
              <input
                value={measure.rehearsal ?? ""}
                onChange={(e) =>
                  edit((score) => {
                    score.tracks.forEach((t) =>
                      allStaves(t).forEach((st) => {
                        const m = st.measures[s.activeMeasureIndex];
                        if (m) m.rehearsal = e.target.value;
                      }),
                    );
                  })
                }
              />
            </label>
            <label>
              Measure tempo{" "}
              <input
                type="number"
                min={20}
                max={400}
                value={measure.tempo ?? s.score.tempo}
                onChange={(e) =>
                  edit((score) => {
                    score.tracks.forEach((t) => {
                      if (t.measures[s.activeMeasureIndex])
                        t.measures[s.activeMeasureIndex].tempo = Math.max(
                          20,
                          Math.min(400, Number(e.target.value) || 120),
                        );
                    });
                  })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={measure.repeatStart ?? false}
                onChange={(e) =>
                  edit((score) => {
                    score.tracks.forEach((t) => {
                      if (t.measures[s.activeMeasureIndex])
                        t.measures[s.activeMeasureIndex].repeatStart =
                          e.target.checked;
                    });
                  })
                }
              />{" "}
              Repeat start
            </label>
            <label>
              Repeat count (0 = none){" "}
              <input
                type="number"
                min={0}
                max={16}
                value={measure.repeatCount ?? 0}
                onChange={(e) =>
                  edit((score) => {
                    score.tracks.forEach((t) => {
                      if (t.measures[s.activeMeasureIndex])
                        t.measures[s.activeMeasureIndex].repeatCount = Math.max(
                          0,
                          Math.min(16, Number(e.target.value)),
                        );
                    });
                  })
                }
              />
            </label>
            <label>
              Ending{" "}
              <select
                value={measure.alternateEndings ?? 0}
                onChange={(e) =>
                  edit((score) => {
                    score.tracks.forEach((t) => {
                      if (t.measures[s.activeMeasureIndex])
                        t.measures[s.activeMeasureIndex].alternateEndings =
                          Number(e.target.value);
                    });
                  })
                }
              >
                <option value={0}>None</option>
                <option value={1}>First</option>
                <option value={2}>Second</option>
              </select>
            </label>
          </>
        )}
        <label>
          Range end{" "}
          <input
            type="number"
            min={s.activeMeasureIndex + 1}
            max={staff?.measures.length ?? 1}
            value={Math.max(s.activeMeasureIndex + 1, rangeEnd)}
            onChange={(e) => setRangeEnd(Number(e.target.value))}
          />
        </label>
        <div className="toolbar wrap">
          <button
            onClick={() => {
              const [a, b] = selected();
              setClipboard(freshIds(staff!.measures.slice(a, b + 1)));
            }}
          >
            Copy range
          </button>
          <button
            disabled={!clipboard}
            onClick={() =>
              edit((score, t) => {
                const st = s.activeStaffIndex
                  ? t.additionalStaves![s.activeStaffIndex - 1]
                  : t;
                st.measures.splice(
                  s.activeMeasureIndex + 1,
                  0,
                  ...freshIds(clipboard!),
                );
                const total = Math.max(
                  ...score.tracks.flatMap((t) =>
                    allStaves(t).map((st) => st.measures.length),
                  ),
                );
                score.tracks.forEach((t) =>
                  allStaves(t).forEach((st) => {
                    while (st.measures.length < total)
                      st.measures.push({
                        index: st.measures.length,
                        voices: [
                          { index: 0, beats: [rest(), rest(), rest(), rest()] },
                        ],
                      });
                  }),
                );
                reindex(score);
              })
            }
          >
            Paste after
          </button>
        </div>
        <label>
          Transpose semitones{" "}
          <input
            type="number"
            min={-24}
            max={24}
            value={semitones}
            onChange={(e) => setSemitones(Number(e.target.value))}
          />
        </label>
        <button
          onClick={() =>
            edit((score, t) => {
              const [a, b] = selected(),
                st = s.activeStaffIndex
                  ? t.additionalStaves![s.activeStaffIndex - 1]
                  : t;
              st.measures.slice(a, b + 1).forEach((m) =>
                m.voices.forEach((v) =>
                  v.beats.forEach((b) =>
                    b.notes.forEach((n) => {
                      n.pitch = Math.max(0, Math.min(127, n.pitch + semitones));
                      if (n.fret !== undefined)
                        n.fret = Math.max(0, Math.min(36, n.fret + semitones));
                    }),
                  ),
                ),
              );
            })
          }
        >
          Transpose range
        </button>
      </details>
      <details open>
        <summary>Touch note entry</summary>
        <div className="beat-list">
          {voice?.beats.map((b, i) => (
            <button
              key={b.id}
              aria-pressed={beat?.id === b.id}
              onClick={() => select(b)}
            >
              {i + 1}:{" "}
              {b.notes.length
                ? b.notes.map((n) => n.fret ?? n.pitch).join("+")
                : (b.isEmpty ?? b.source?.isempty)
                  ? "spacer"
                  : "rest"}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const b = rest();
            edit((_, t, m) => {
              if (!m) return;
              while (m.voices.length <= s.activeVoiceIndex)
                m.voices.push({ index: m.voices.length, beats: [] });
              m.voices[s.activeVoiceIndex].beats.push(b);
            });
            select(b);
          }}
        >
          Add beat
        </button>
        <div className="toolbar wrap">
          {(["w", "h", "q", "e", "s", "t"] as const).map((v, i) => (
            <button
              key={v}
              disabled={!beat}
              aria-pressed={beat?.duration === v}
              onClick={() => patchBeat((b) => setBeatDuration(b, v))}
            >
              {["1", "1/2", "1/4", "1/8", "1/16", "1/32"][i]}
            </button>
          ))}
        </div>
        <div className="toolbar wrap">
          <button
            disabled={!beat}
            aria-pressed={beat?.isDotted ?? false}
            onClick={() => patchBeat((b) => (b.isDotted = !b.isDotted))}
          >
            Dotted
          </button>
          <button
            disabled={!beat}
            aria-pressed={beat?.isTuplet ?? false}
            onClick={() =>
              patchBeat((b) => {
                b.isTuplet = !b.isTuplet;
                b.tuplet = [3, 2];
              })
            }
          >
            Tuplet
          </button>
          <button
            disabled={!beat}
            onClick={() =>
              patchBeat((b) => {
                b.notes = [];
                b.isEmpty = false;
              })
            }
          >
            Rest
          </button>
          <button
            disabled={!note}
            aria-pressed={note?.isTied ?? false}
            onClick={() =>
              patchBeat((b) => {
                const n = b.notes.find((n) => n.id === s.activeNoteId);
                if (n) n.isTied = !n.isTied;
              })
            }
          >
            Tie
          </button>
        </div>
        {beat?.isTuplet && (
          <label>
            Tuplet ratio{" "}
            <select
              value={(beat.tuplet ?? [3, 2]).join(":")}
              onChange={(e) =>
                patchBeat(
                  (b) =>
                    (b.tuplet = e.target.value.split(":").map(Number) as [
                      number,
                      number,
                    ]),
                )
              }
            >
              {["3:2", "5:4", "6:4", "7:4"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        )}
        {track.tuning ? (
          <>
            <label>
              String{" "}
              <select
                value={string}
                onChange={(e) => setString(Number(e.target.value))}
              >
                {track.tuning.map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fret{" "}
              <input
                type="number"
                min={0}
                max={36}
                value={fret}
                onChange={(e) =>
                  setFret(Math.max(0, Math.min(36, Number(e.target.value))))
                }
              />
            </label>
          </>
        ) : (
          <label>
            MIDI pitch{" "}
            <input
              type="number"
              min={0}
              max={127}
              value={pitch}
              onChange={(e) =>
                setPitch(Math.max(0, Math.min(127, Number(e.target.value))))
              }
            />
          </label>
        )}
        <button disabled={!measure} onClick={() => addNote()}>
          Insert note
        </button>
        <div className="keyboard">
          {Array.from({ length: 13 }, (_, i) => (
            <button
              key={i}
              aria-label={`Pitch ${60 + i}`}
              onClick={() => {
                setPitch(60 + i);
                if (!track.tuning) addNote(60 + i);
              }}
            >
              {
                [
                  "C",
                  "C#",
                  "D",
                  "D#",
                  "E",
                  "F",
                  "F#",
                  "G",
                  "G#",
                  "A",
                  "A#",
                  "B",
                  "C",
                ][i]
              }
            </button>
          ))}
        </div>
        {beat && (
          <>
            <label>
              Notes{" "}
              <select
                value={s.activeNoteId ?? ""}
                onChange={(e) => s.setActiveNote(e.target.value || null)}
              >
                <option value="">Choose note</option>
                {beat.notes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.string !== undefined
                      ? `String ${n.string + 1}, fret ${n.fret}`
                      : `Pitch ${n.pitch}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="lyric-verses">
              {Array.from(
                { length: Math.max(1, beat.lyrics?.length ?? 0) },
                (_, i) => (
                  <label key={i}>
                    Lyric verse {i + 1}{" "}
                    <input
                      value={beat.lyrics?.[i] ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        patchBeat((b) => {
                          const lyrics = [...(b.lyrics ?? [])];
                          while (lyrics.length <= i) lyrics.push("");
                          lyrics[i] = value;
                          b.lyrics = lyrics;
                        });
                      }}
                    />
                  </label>
                ),
              )}
              <button
                type="button"
                onClick={() =>
                  patchBeat((b) => {
                    const lyrics = [...(b.lyrics ?? [])];
                    while (lyrics.length < 1) lyrics.push("");
                    lyrics.push("");
                    b.lyrics = lyrics;
                  })
                }
              >
                Add lyric verse
              </button>
            </div>
            <label>
              Text{" "}
              <input
                value={beat.text ?? ""}
                onChange={(e) => patchBeat((b) => (b.text = e.target.value))}
              />
            </label>
            <label>
              Chord{" "}
              <input
                value={beat.chord?.name ?? ""}
                onChange={(e) =>
                  patchBeat(
                    (b) =>
                      (b.chord = e.target.value
                        ? { name: e.target.value }
                        : undefined),
                  )
                }
              />
            </label>
            <label>
              Dynamics{" "}
              <select
                value={beat.dynamics ?? "mf"}
                onChange={(e) =>
                  patchBeat(
                    (b) => (b.dynamics = e.target.value as BeatAST["dynamics"]),
                  )
                }
              >
                {["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {note && (
          <>
            <label>
              Selected pitch{" "}
              <input
                type="number"
                min={0}
                max={127}
                value={note.pitch}
                onChange={(e) =>
                  patchBeat((b) => {
                    const n = b.notes.find((n) => n.id === note.id)!;
                    n.pitch = Math.max(
                      0,
                      Math.min(127, Number(e.target.value)),
                    );
                    if (n.string !== undefined && track.tuning)
                      n.fret = Math.max(0, n.pitch - track.tuning[n.string]);
                  })
                }
              />
            </label>
            <div className="toolbar wrap">
              {(["accent", "palmMute", "letRing", "staccato"] as const).map(
                (key) => (
                  <button
                    key={key}
                    aria-pressed={!!note.articulations?.[key]}
                    onClick={() =>
                      patchBeat((b) => {
                        const n = b.notes.find((n) => n.id === note.id)!;
                        n.articulations ??= {};
                        n.articulations[key] = !n.articulations[key];
                      })
                    }
                  >
                    {key}
                  </button>
                ),
              )}
              <button
                onClick={() =>
                  patchBeat(
                    (b) => (b.notes = b.notes.filter((n) => n.id !== note.id)),
                  )
                }
              >
                Delete note
              </button>
            </div>
          </>
        )}
      </details>
      {track.tuning && (
        <details>
          <summary>Touch fretboard</summary>
          <div className="fretboard">
            {track.tuning.map((pitch, si) => (
              <div key={si}>
                <span>String {si + 1}</span>
                {Array.from({ length: 13 }, (_, f) => (
                  <button
                    key={f}
                    aria-label={"String ${si+1}, fret ${f}"}
                    onClick={() => addNote(undefined, si, f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
      <NotationDetails />
    </aside>
  );
}
