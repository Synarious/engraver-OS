// Runs inside alphaTab's horizontal renderer after it measures the notation.
// The renderer uses the same positions for engraving, hit testing and playback.
function spaceHorizontalBars(
  partials,
  quarterTicks,
  leftPadding,
  quarterWidth,
  firstBeatInset,
) {
  const pixelsPerTick = quarterWidth / quarterTicks;

  for (const [partialIndex, partial] of partials.entries()) {
    partial.width = partialIndex === 0 ? leftPadding : 0;
    for (const [barIndex, bar] of partial.results.entries()) {
      const info = bar.layoutingInfo;
      const springs = Array.from(info.springs.values()).sort(
        (a, b) => a.timePosition - b.timePosition,
      );
      const writtenWidth = Math.max(
        bar.masterBar.displayWidth,
        ...bar.renderers.map((renderer) => renderer.bar.displayWidth),
      );
      const durationWidth = bar.masterBar.calculateDuration() * pixelsPerTick;
      let width = Math.max(durationWidth, writtenWidth);
      if (springs.length) {
        const before = info.preBeatSize + springs[0].preSpringWidth;
        const after =
          info.postBeatSize +
          springs.at(-1).postSpringWidth +
          info._incompleteGraceRodsWidth;
        const gaps = springs
          .slice(1)
          .map(
            (spring, i) => springs[i].postSpringWidth + spring.preSpringWidth,
          );
        // Keep the opening clefs and signatures outside the timed space.
        const openingPad =
          partialIndex === 0 && barIndex === 0
            ? Math.max(0, before - firstBeatInset)
            : 0;
        let remaining = gaps.reduce((total, gap) => total + gap, after);
        width = Math.max(width + openingPad, before + remaining);
        const positions = new Map();
        let earliest = before;
        for (const [index, spring] of springs.entries()) {
          const tick = spring.timePosition - bar.masterBar.start;
          const ideal = firstBeatInset + openingPad + tick * pixelsPerTick;
          // Leave room for accidentals, grace notes and barlines.
          const position = Math.max(
            earliest,
            Math.min(ideal, width - remaining),
          );
          positions.set(spring.timePosition, position - info.preBeatSize);
          const gap = gaps[index] ?? 0;
          earliest = position + gap;
          remaining -= gap;
        }
        const voiceWidth = width - info.preBeatSize - info.postBeatSize;
        info.buildOnTimePositions = () => positions;
        info.calculateVoiceWidth = () => voiceWidth;
      } else {
        width = Math.max(width, bar.width);
      }
      bar.width = width;
      partial.width += width;
      for (const renderer of bar.renderers) renderer.scaleToWidth(width);
    }
  }
}

module.exports = { spaceHorizontalBars, quarterWidth: 256, firstBeatInset: 56 };
