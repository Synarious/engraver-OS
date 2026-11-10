import type { ScoreAST } from "../../types/score";
import {
  isScaleDiagram,
  pitchClass,
  rootLabel,
  scales,
  type ScaleDiagramData,
} from "../../utils/harmonyLibrary";
import { pitchName, scoreBeats } from "../../utils/scoreSelection";

export function ChordShape({
  tuning,
  strings,
  firstFret,
  name,
}: {
  tuning: number[];
  strings: number[];
  firstFret: number;
  name: string;
}) {
  const width = 52 + (tuning.length - 1) * 25;
  return (
    <svg
      className="harmony-chord-shape"
      viewBox={`0 0 ${width} 164`}
      role="img"
      aria-label={`${name}; frets from lowest string: ${strings
        .slice()
        .reverse()
        .map((f) => (f < 0 ? "muted" : f))
        .join(", ")}`}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <path
          key={i}
          d={`M26 ${26 + i * 21}H${width - 26}`}
          stroke="currentColor"
          strokeWidth={i === 0 && firstFret === 1 ? 3 : 1}
        />
      ))}
      <text x="8" y="42" fontSize="10" fill="currentColor">
        {firstFret}
      </text>
      {strings.map((fret, i) => {
        const x = width - 26 - i * 25,
          y = 26 + (fret - firstFret + 0.5) * 21;
        return (
          <g key={i}>
            <path d={`M${x} 26V131`} stroke="currentColor" />
            {fret <= 0 ? (
              <text
                x={x}
                y="17"
                textAnchor="middle"
                fontSize="14"
                fill="currentColor"
              >
                {fret === 0 ? "○" : "×"}
              </text>
            ) : (
              <>
                <circle cx={x} cy={y} r="9" fill="currentColor" />
                <text
                  x={x}
                  y={y + 3}
                  textAnchor="middle"
                  fontSize="9"
                  className="harmony-dot-label"
                >
                  {fret}
                </text>
              </>
            )}
            <text
              x={x}
              y="151"
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
            >
              {pitchName(tuning[i])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const intervals = [
  "R",
  "♭2",
  "2",
  "♭3",
  "3",
  "4",
  "♯4",
  "5",
  "♭6",
  "6",
  "♭7",
  "7",
];
export function ScaleFretboard({ diagram }: { diagram: ScaleDiagramData }) {
  const { root, scale, tuning, firstFret, lastFret } = diagram;
  const ranges: [number, number][] = [];
  for (let start = firstFret; start <= lastFret;) {
    const end = Math.min(start + (start === 0 ? 12 : 11), lastFret);
    ranges.push([start, end]);
    start = end + 1;
  }
  return (
    <div className="harmony-fretboards">
      {ranges.map(([start, end]) => {
        const frets = Array.from(
          { length: end - start + 1 },
          (_, i) => start + i,
        );
        const width = 52 + 38 * frets.length,
          height = 35 + 25 * tuning.length;
        return (
          <div
            className="harmony-neck-scroll"
            key={start}
            tabIndex={0}
            role="region"
            aria-label={`Frets ${start} to ${end}`}
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              style={{ width: Math.min(520, width) }}
              role="img"
              aria-label={`${rootLabel(root)} ${scale}, ${tuning.length} strings, frets ${start} to ${end}. R marks the root.`}
            >
              {frets.map((fret, column) => {
                const x = 46 + column * 38;
                return (
                  <g key={fret}>
                    <text
                      x={x + 19}
                      y="15"
                      textAnchor="middle"
                      fill="currentColor"
                      fontSize="11"
                    >
                      {fret || "Open"}
                    </text>
                    <path
                      d={`M${x} 23V${height - 6}`}
                      stroke="currentColor"
                      opacity=".28"
                    />
                  </g>
                );
              })}
              {tuning.map((open, row) => {
                const y = 33 + row * 25;
                return (
                  <g key={row}>
                    <text
                      x="39"
                      y={y + 4}
                      textAnchor="end"
                      fill="currentColor"
                      fontSize="12"
                    >
                      {pitchName(open)}
                    </text>
                    <path
                      d={`M46 ${y}H${width - 6}`}
                      stroke="currentColor"
                      opacity=".28"
                    />
                    {frets.map((fret, column) => {
                      const degree = pitchClass(open + fret - root);
                      if (
                        !(scales[scale] as readonly number[]).includes(
                          degree,
                        ) ||
                        open + fret > 127
                      )
                        return null;
                      const x = 65 + column * 38;
                      return (
                        <g key={fret}>
                          <title>
                            {pitchName(open + fret)} · String {row + 1} · Fret{" "}
                            {fret}
                          </title>
                          <circle
                            cx={x}
                            cy={y}
                            r="10"
                            className={
                              degree === 0 ? "harmony-root" : "harmony-tone"
                            }
                          />
                          <text
                            x={x}
                            y={y + 3.5}
                            textAnchor="middle"
                            fontSize="10"
                            className="harmony-scale-label"
                          >
                            {intervals[degree]}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

export function SavedScaleDiagrams({
  score,
  trackId,
}: {
  score: ScoreAST;
  trackId: string | null;
}) {
  const diagrams = scoreBeats(score).flatMap(({ track, location, beat }) =>
    (!trackId || track.id === trackId) && isScaleDiagram(beat.scaleDiagram)
      ? [
          {
            id: beat.id,
            diagram: beat.scaleDiagram,
            track: track.name,
            location,
          },
        ]
      : [],
  );
  if (!diagrams.length) return null;
  return (
    <section
      id="score-scale-diagrams"
      className="harmony-saved"
      aria-label="Saved scale diagrams"
      tabIndex={-1}
    >
      <h2>Scale diagrams</h2>
      {diagrams.map(({ id, diagram, track, location }) => (
        <figure key={id}>
          <figcaption>
            <strong>
              {rootLabel(diagram.root)} {diagram.scale}
            </strong>
            <span>
              {track} · Measure {location.measureIndex + 1} · Staff{" "}
              {location.staffIndex + 1} · Voice {location.voiceIndex + 1}
            </span>
          </figcaption>
          <ScaleFretboard diagram={diagram} />
        </figure>
      ))}
    </section>
  );
}
