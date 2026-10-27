"use client";
import { notationCommands } from "../../utils/notationCommands";
import { restGlyphs } from "./restGlyphs";
const glyphs: Record<string, string> = {
  "Whole note": "\uE1D2",
  "Half note": "\uE1D3",
  "Quarter note": "\uE1D5",
  "Eighth note": "\uE1D7",
  "16th note": "\uE1D9",
  "32nd note": "\uE1DB",
  "64th note": "\uE1DD",
  "128th note": "\uE1DF",
  Rest: "\uE4E5",
  Dotted: "\uE1E7",
  Accent: "\uE4A0",
  Staccato: "\uE4A2",
};
export function hasNotationSymbol(label: string) {
  return (
    notationCommands.some((c) => c.label === label) ||
    [
      "Double dotted",
      "Triple dotted",
      "Custom tuplet",
      "Straight rhythm",
    ].includes(label) ||
    label.startsWith("Dynamics ") ||
    label in glyphs ||
    [
      "Triplet",
      "Tie",
      "Palm mute",
      "Let ring",
      "− Octave",
      "+ Octave",
    ].includes(label)
  );
}
export function NotationSymbol({ label }: { label: string }) {
  const command = notationCommands.find((c) => c.label === label);
  const glyph = command?.glyph
    ? String.fromCodePoint(command.glyph)
    : glyphs[label];
  const rest =
    command?.scope === "rest"
      ? restGlyphs[command.duration ?? "q"]
      : label === "Rest"
        ? restGlyphs.q
        : null;
  if (rest)
    return (
      <svg
        width="26"
        height="30"
        viewBox={
          command?.duration === "w" || command?.duration === "h"
            ? "-110 -300 500 600"
            : rest.viewBox
        }
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        className="notation-symbol rest-symbol"
      >
        {(command?.duration === "w" || command?.duration === "h") && (
          <line
            x1="-90"
            x2="370"
            y1="0"
            y2="0"
            stroke="currentColor"
            strokeWidth="18"
            opacity=".7"
          />
        )}
        <path d={rest.path} transform="scale(1,-1)" fill="currentColor" />
      </svg>
    );
  return (
    <svg
      width="26"
      height="30"
      viewBox="0 0 32 36"
      aria-hidden="true"
      className="notation-symbol"
    >
      {command && !command.glyph ? (
        <text
          x="16"
          y="23"
          textAnchor="middle"
          fill="currentColor"
          fontFamily="serif"
          fontSize="14"
        >
          {command.text}
        </text>
      ) : [
          "Double dotted",
          "Triple dotted",
          "Custom tuplet",
          "Straight rhythm",
        ].includes(label) ? (
        <text
          x="16"
          y="23"
          textAnchor="middle"
          fill="currentColor"
          fontFamily="serif"
          fontSize="15"
        >
          {
            {
              "Double dotted": "··",
              "Triple dotted": "···",
              "Custom tuplet": "n:m",
              "Straight rhythm": "1:1",
            }[label]
          }
        </text>
      ) : label.startsWith("Dynamics ") ? (
        <text
          x="16"
          y="24"
          textAnchor="middle"
          fill="currentColor"
          fontFamily="serif"
          fontWeight="bold"
          fontStyle="italic"
          fontSize="16"
        >
          {label.slice(9)}
        </text>
      ) : glyph ? (
        <text
          x="16"
          y={label.endsWith("note") ? 28 : 22}
          textAnchor="middle"
          fontFamily="EngraverNotation"
          fontSize={
            label === "128th note"
              ? 20
              : label === "64th note"
                ? 22
                : label === "32nd note"
                  ? 25
                  : 29
          }
          fill="currentColor"
        >
          {glyph}
        </text>
      ) : label === "Tie" ? (
        <path d="M4 14 Q16 29 28 14 Q16 24 4 14" fill="currentColor" />
      ) : label === "Triplet" ? (
        <>
          <path
            d="M4 25v-5h7m10 0h7v5"
            stroke="currentColor"
            fill="none"
            strokeWidth="1.4"
          />
          <text
            x="16"
            y="23"
            textAnchor="middle"
            fill="currentColor"
            fontSize="17"
            fontFamily="serif"
            fontStyle="italic"
          >
            3
          </text>
        </>
      ) : (
        <text
          x="16"
          y="23"
          textAnchor="middle"
          fill="currentColor"
          fontSize={label.includes("Octave") ? 15 : 12}
          fontFamily="serif"
          fontStyle="italic"
        >
          {label === "Palm mute"
            ? "P.M."
            : label === "Let ring"
              ? "l.r."
              : label === "+ Octave"
                ? "8va"
                : "8vb"}
        </text>
      )}
    </svg>
  );
}
