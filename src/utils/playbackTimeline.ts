export function formatPlaybackTime(milliseconds: number): string {
  const total = Math.max(
    0,
    Math.floor((Number.isFinite(milliseconds) ? milliseconds : 0) / 1000),
  );
  const seconds = total % 60,
    minutes = Math.floor(total / 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
export function activePlaybackBlock(
  blocks: { start: number; end: number }[],
  tick: number,
): number {
  if (!blocks.length) return -1;
  const index = blocks.findIndex(
    (block) => tick >= block.start && tick < block.end,
  );
  return index >= 0
    ? index
    : tick >= blocks[blocks.length - 1].end
      ? blocks.length - 1
      : -1;
}
type TimedBlock = {
  start: number;
  end: number;
  tempoChanges: readonly { tick: number; tempo: number }[];
};
/** Relative playback durations, including tempo changes and repeated measures. */
export function playbackSegments(
  blocks: readonly TimedBlock[],
  maxSegments = 80,
): number[] {
  let tempo = 120;
  const weights = blocks.map((block) => {
    let cursor = block.start,
      duration = 0;
    for (const change of block.tempoChanges) {
      if (
        !Number.isFinite(change.tick) ||
        !Number.isFinite(change.tempo) ||
        change.tempo <= 0
      )
        continue;
      const at = Math.max(block.start, Math.min(block.end, change.tick));
      if (at > cursor) duration += (at - cursor) / tempo;
      cursor = Math.max(cursor, at);
      tempo = change.tempo;
    }
    return duration + Math.max(0, block.end - cursor) / tempo;
  });
  const groupSize = Math.max(
    1,
    Math.ceil(weights.length / Math.max(1, maxSegments)),
  );
  const grouped: number[] = [];
  for (let i = 0; i < weights.length; i += groupSize)
    grouped.push(
      weights.slice(i, i + groupSize).reduce((sum, value) => sum + value, 0),
    );
  return grouped.filter((value) => value > 0);
}
