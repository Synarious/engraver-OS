"use client";
import { useEditorStore } from "../../store/editorStore";
export function NotationDetails() {
  const s = useEditorStore(),
    score = s.score,
    t = score?.tracks.find((t) => t.id === s.activeTrackId),
    staff = s.activeStaffIndex
      ? t?.additionalStaves?.[s.activeStaffIndex - 1]
      : t,
    m = staff?.measures[s.activeMeasureIndex],
    b = m?.voices[s.activeVoiceIndex]?.beats.find(
      (b) => b.id === s.activeBeatId,
    ),
    n = b?.notes.find((n) => n.id === s.activeNoteId);
  if (!score || !t) return null;
  const raw = (
    kind: "note" | "beat" | "bar" | "staff",
    key: string,
    value: unknown,
  ) =>
    s.editScore((score) => {
      const track = score.tracks.find((t) => t.id === s.activeTrackId)!;
      const st = s.activeStaffIndex
        ? track.additionalStaves![s.activeStaffIndex - 1]
        : track;
      const bar = st.measures[s.activeMeasureIndex],
        beat = bar?.voices[s.activeVoiceIndex]?.beats.find(
          (b) => b.id === s.activeBeatId,
        ),
        note = beat?.notes.find((n) => n.id === s.activeNoteId);
      if (kind === "staff") {
        if (s.activeStaffIndex) {
          const target = track.additionalStaves![s.activeStaffIndex - 1];
          target.source = { ...target.source, [key]: value };
        } else {
          track.source ??= {};
          track.source.staves ??= [{}];
          track.source.staves[0] = { ...track.source.staves[0], [key]: value };
        }
        return;
      }
      const target = kind === "note" ? note : kind === "beat" ? beat : bar;
      if (target) target.source = { ...target.source, [key]: value };
    });
  const noteFields = [
    ["Slur destination", "isslurdestination"],
    ["Hammer-on / pull-off origin", "ishammerpullorigin"],
    ["Ghost note", "isghost"],
    ["Left-hand tap", "islefthandtapped"],
  ] as const;
  return (
    <>
      <details>
        <summary>Notation & techniques</summary>
        <label>
          Display transposition{" "}
          <input
            type="number"
            min={-24}
            max={24}
            value={
              (s.activeStaffIndex
                ? t.additionalStaves?.[s.activeStaffIndex - 1]?.source
                : t.source?.staves?.[0]
              )?.displaytranspositionpitch ?? 0
            }
            onChange={(e) =>
              raw("staff", "displaytranspositionpitch", Number(e.target.value))
            }
          />
        </label>
        {b && (
          <>
            <label>
              Stem direction
              <select
                value={b.stemDirection ?? ""}
                onChange={(e) =>
                  s.editScore((score) => {
                    const track = score.tracks.find(
                      (t) => t.id === s.activeTrackId,
                    )!;
                    const staff = s.activeStaffIndex
                      ? track.additionalStaves![s.activeStaffIndex - 1]
                      : track;
                    const beat = staff.measures[s.activeMeasureIndex].voices[
                      s.activeVoiceIndex
                    ].beats.find((v) => v.id === b.id)!;
                    beat.stemDirection = (e.target.value ||
                      undefined) as typeof beat.stemDirection;
                  })
                }
              >
                <option value="">Automatic</option>
                <option value="up">Up</option>
                <option value="down">Down</option>
              </select>
            </label>
            <label>
              Beaming{" "}
              <select
                value={b.source?.beamingmode ?? 0}
                onChange={(e) =>
                  raw("beat", "beamingmode", Number(e.target.value))
                }
              >
                {[
                  "Automatic",
                  "Split next",
                  "Merge next",
                  "Split secondary",
                ].map((v, i) => (
                  <option key={v} value={i}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Hairpin{" "}
              <select
                value={b.source?.crescendo ?? 0}
                onChange={(e) =>
                  raw("beat", "crescendo", Number(e.target.value))
                }
              >
                {["None", "Crescendo", "Decrescendo"].map((v, i) => (
                  <option key={v} value={i}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <div className="toolbar wrap">
              {["slap", "pop", "tap"].map((key) => (
                <button
                  key={key}
                  aria-pressed={!!b.source?.[key]}
                  onClick={() => raw("beat", key, !b.source?.[key])}
                >
                  {key}
                </button>
              ))}
            </div>
            {b.chord && (
              <label>
                Chord frets (low to high, -1 = muted)
                <input
                  key={b.id}
                  defaultValue={b.chord.strings?.join(",") ?? ""}
                  placeholder="-1,3,2,0,1,0"
                  onBlur={(e) => {
                    const values = e.target.value.split(",").map(Number);
                    if (
                      values.every(
                        (n) => Number.isInteger(n) && n >= -1 && n <= 36,
                      )
                    )
                      s.editScore((score) => {
                        const track = score.tracks.find(
                            (t) => t.id === s.activeTrackId,
                          )!,
                          st = s.activeStaffIndex
                            ? track.additionalStaves![s.activeStaffIndex - 1]
                            : track,
                          beat = st.measures[s.activeMeasureIndex].voices[
                            s.activeVoiceIndex
                          ].beats.find((v) => v.id === b.id)!;
                        if (beat.chord) beat.chord.strings = values.reverse();
                      });
                  }}
                />
              </label>
            )}
          </>
        )}
        {n && (
          <>
            <div className="toolbar wrap">
              {noteFields.map(([label, key]) => (
                <button
                  key={key}
                  aria-pressed={!!n.source?.[key]}
                  onClick={() => raw("note", key, !n.source?.[key])}
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              Accidental{" "}
              <select
                value={n.source?.accidentalmode ?? 0}
                onChange={(e) =>
                  raw("note", "accidentalmode", Number(e.target.value))
                }
              >
                {[
                  "Automatic",
                  "Hidden",
                  "Natural",
                  "Sharp",
                  "Double sharp",
                  "Flat",
                  "Double flat",
                ].map((v, i) => (
                  <option key={v} value={i}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vibrato{" "}
              <select
                value={n.source?.vibrato ?? 0}
                onChange={(e) => raw("note", "vibrato", Number(e.target.value))}
              >
                {["None", "Slight", "Wide"].map((v, i) => (
                  <option key={v} value={i}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Harmonic{" "}
              <select
                value={n.source?.harmonictype ?? 0}
                onChange={(e) => {
                  raw("note", "harmonictype", Number(e.target.value));
                  if (Number(e.target.value)) raw("note", "harmonicvalue", 12);
                }}
              >
                {[
                  "None",
                  "Natural",
                  "Artificial",
                  "Pinch",
                  "Tap",
                  "Semi",
                  "Feedback",
                ].map((v, i) => (
                  <option key={v} value={i}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bend{" "}
              <select
                value={
                  n.source?.bendtype
                    ? String(n.source?.bendpoints?.at(-1)?.value ?? 0)
                    : "0"
                }
                onChange={(e) => {
                  const value = Number(e.target.value);
                  s.editScore((score) => {
                    const track = score.tracks.find(
                        (t) => t.id === s.activeTrackId,
                      )!,
                      st = s.activeStaffIndex
                        ? track.additionalStaves![s.activeStaffIndex - 1]
                        : track,
                      note = st.measures[s.activeMeasureIndex].voices[
                        s.activeVoiceIndex
                      ].beats
                        .find((v) => v.id === b?.id)!
                        .notes.find((v) => v.id === n.id)!;
                    note.source = {
                      ...note.source,
                      bendtype: value ? 1 : 0,
                      bendpoints: value
                        ? [
                            { offset: 0, value: 0 },
                            { offset: 60, value },
                          ]
                        : [],
                    };
                  });
                }}
              >
                {[
                  ["0", "None"],
                  ["2", "Half step"],
                  ["4", "Whole step"],
                  ["6", "1½ steps"],
                ].map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {m && (
          <label>
            Pedal at measure start{" "}
            <select
              value={m.source?.sustainpedals?.[0]?.pedaltype ?? ""}
              onChange={(e) =>
                raw(
                  "bar",
                  "sustainpedals",
                  e.target.value === ""
                    ? []
                    : [{ ratioposition: 0, pedaltype: Number(e.target.value) }],
                )
              }
            >
              <option value="">None</option>
              <option value={0}>Down</option>
              <option value={2}>Up</option>
            </select>
          </label>
        )}
      </details>
      <details>
        <summary>Engraving & page layout</summary>
        {(
          [
            ["systemGap", "Space between systems", 200],
            ["staffGap", "Extra staff spacing", 120],
            ["lyricLineGap", "Space between lyric verses", 80],
          ] as const
        ).map(([key, label, max]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={0}
              max={max}
              value={score.engraving?.[key] ?? (key === "systemGap" ? 20 : 5)}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value))
                  s.editScore((score) => {
                    score.engraving = {
                      ...score.engraving,
                      [key]: Math.max(0, Math.min(max, value)),
                    };
                  });
              }}
            />
          </label>
        ))}
        {(
          [
            ["lyricFontSize", "Lyric font size", 12],
            ["titleFontSize", "Title font size", 32],
          ] as const
        ).map(([key, label, fallback]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={8}
              max={64}
              value={score.engraving?.[key] ?? fallback}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value))
                  s.editScore((score) => {
                    score.engraving = {
                      ...score.engraving,
                      [key]: Math.max(8, Math.min(64, value)),
                    };
                  });
              }}
            />
          </label>
        ))}
        <label>
          System measure counts{" "}
          <input
            defaultValue={score.source?.systemslayout?.join(",") ?? ""}
            placeholder="4,4,3,4"
            onBlur={(e) => {
              const counts = e.target.value
                ? e.target.value.split(",").map(Number)
                : [];
              if (counts.every((n) => Number.isInteger(n) && n > 0 && n <= 32))
                s.editScore((score) => {
                  score.source = { ...score.source, systemslayout: counts };
                  score.tracks.forEach((t) => {
                    t.source = { ...t.source, systemslayout: counts };
                  });
                });
            }}
          />
        </label>
        {m && (
          <>
            <label>
              Measure meter{" "}
              <select
                value={(m.timeSignature ?? score.timeSignature).join("/")}
                onChange={(e) =>
                  s.editScore((score) => {
                    const ts = e.target.value.split("/").map(Number) as [
                      number,
                      number,
                    ];
                    score.tracks.forEach((t) => {
                      for (const staff of [
                        { measures: t.measures },
                        ...(t.additionalStaves ?? []),
                      ])
                        if (staff.measures[s.activeMeasureIndex])
                          staff.measures[s.activeMeasureIndex].timeSignature =
                            ts;
                    });
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
            <label>
              Navigation mark{" "}
              <select
                value={m.masterSource?.directions?.[0] ?? ""}
                onChange={(e) =>
                  s.editScore((score) => {
                    score.tracks.forEach((t) => {
                      const measure = t.measures[s.activeMeasureIndex];
                      if (measure)
                        measure.masterSource = {
                          ...measure.masterSource,
                          directions:
                            e.target.value === ""
                              ? []
                              : [Number(e.target.value)],
                        };
                    });
                  })
                }
              >
                <option value="">None</option>
                {[
                  [0, "Fine"],
                  [1, "Segno"],
                  [3, "Coda"],
                  [5, "D.C."],
                  [6, "D.C. al Coda"],
                  [8, "D.C. al Fine"],
                  [9, "D.S."],
                  [10, "D.S. al Coda"],
                  [12, "D.S. al Fine"],
                  [17, "To Coda"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label>
          Bars per system{" "}
          <input
            type="number"
            min={1}
            max={12}
            value={score.engraving?.barsPerRow ?? 4}
            onChange={(e) =>
              s.editScore((score) => {
                score.engraving = {
                  ...score.engraving,
                  barsPerRow: Math.max(1, Math.min(12, Number(e.target.value))),
                };
              })
            }
          />
        </label>
        <p className="editing-help">
          Switch Staff, Tab, or Combined above the score.
        </p>
        <label>
          Page width{" "}
          <input
            type="number"
            min={320}
            max={2000}
            step={20}
            value={score.engraving?.width ?? 1000}
            onChange={(e) =>
              s.editScore((score) => {
                score.engraving = {
                  ...score.engraving,
                  width: Math.max(320, Math.min(2000, Number(e.target.value))),
                };
              })
            }
          />
        </label>
        <label>
          Page padding{" "}
          <input
            type="number"
            min={0}
            max={100}
            value={score.engraving?.padding ?? 20}
            onChange={(e) =>
              s.editScore((score) => {
                score.engraving = {
                  ...score.engraving,
                  padding: Math.max(0, Math.min(100, Number(e.target.value))),
                };
              })
            }
          />
        </label>
        <label>
          Measure spacing{" "}
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={m?.source?.displayscale ?? 1}
            onChange={(e) => raw("bar", "displayscale", Number(e.target.value))}
          />
        </label>
      </details>
    </>
  );
}
