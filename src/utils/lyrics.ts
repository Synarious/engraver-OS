import type { BeatAST } from "../types/score";

/** Spaces advance a word, hyphens split syllables, and _ holds the last word. */
export function lyricTokens(text: string) {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap<{
      text: string;
      detail: NonNullable<BeatAST["lyricDetails"]>[number];
    }>((word) => {
      if (word === "_")
        return [{ text: "", detail: { extend: "continue" as const } }];
      const parts = word.split("-").filter(Boolean);
      return parts.map((text, i) => ({
        text,
        detail: {
          syllabic: (parts.length === 1
            ? "single"
            : i === 0
              ? "begin"
              : i === parts.length - 1
                ? "end"
                : "middle") as "single" | "begin" | "middle" | "end",
        },
      }));
    });
}

export function distributeLyrics(
  beats: BeatAST[],
  verse: number,
  input: string,
) {
  const tokens = lyricTokens(input),
    targets = beats.filter((b) => b.notes.length && !b.isEmpty);
  if (tokens.length > targets.length)
    throw new Error(
      `These lyrics need ${tokens.length} notes; ${targets.length} are available from this beat.`,
    );
  tokens.forEach((token, i) => {
    if (token.detail.extend === "continue") {
      if (i > 0 && tokens[i - 1].text) tokens[i - 1].detail.extend = "start";
      token.detail.extend =
        tokens[i + 1]?.detail.extend === "continue" ? "continue" : "stop";
    }
  });
  tokens.forEach((token, i) => {
    const beat = targets[i];
    beat.lyrics ??= [];
    beat.lyricDetails ??= [];
    beat.lyrics[verse] = token.text;
    beat.lyricDetails[verse] = {
      ...beat.lyricDetails[verse],
      syllabic: undefined,
      extend: undefined,
      ...token.detail,
    };
  });
}
