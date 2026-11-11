import type { ScoreAST } from "../types/score";

type PracticePreferences = NonNullable<ScoreAST["practice"]>;
type PracticeScore = Pick<ScoreAST, "id" | "practice">;

const key = (id: string) => `engraver-practice:${id}`;

function readPreferences(value: unknown): PracticePreferences {
  if (!value || typeof value !== "object") return {};
  const { speed, metronome, countIn, follow } = value as Record<
    string,
    unknown
  >;
  return {
    ...(typeof speed === "number" && speed >= 0.25 && speed <= 2
      ? { speed }
      : {}),
    ...(typeof metronome === "boolean" ? { metronome } : {}),
    ...(typeof countIn === "boolean" ? { countIn } : {}),
    ...(typeof follow === "boolean" ? { follow } : {}),
  };
}

export function scorePracticePreferences(score: PracticeScore) {
  const embedded = readPreferences(score.practice);
  try {
    const saved = localStorage.getItem(key(score.id));
    if (saved) return { ...embedded, ...readPreferences(JSON.parse(saved)) };
  } catch {
    // An unreadable local record still leaves the project's settings.
  }
  return embedded;
}

// Practice controls save a few values without cloning or revising the score.
export function saveScorePracticePreferences(
  score: PracticeScore,
  change: PracticePreferences,
) {
  localStorage.setItem(
    key(score.id),
    JSON.stringify({ ...scorePracticePreferences(score), ...change }),
  );
}

export function withScorePracticePreferences(score: ScoreAST): ScoreAST {
  const practice = scorePracticePreferences(score);
  return Object.keys(practice).length ? { ...score, practice } : score;
}
