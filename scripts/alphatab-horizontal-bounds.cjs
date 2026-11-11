const {
  spaceHorizontalBars,
  quarterWidth,
  firstBeatInset,
} = require("./alphatab-horizontal-spacing.cjs");

// Patch only alphaTab 1.8.4's horizontal layout. Keep the SVG partials lazy
// and build one set of bounds for the whole system.
module.exports = function fixHorizontalLayout(source) {
  const start = source.indexOf(
    "class HorizontalScreenLayout extends ScoreLayout",
  );
  const end = source.indexOf("//#endregion", start);
  const layout = source.slice(start, end);
  const repeated = "\n\t\t\tthis._system.buildBoundingsLookup(0, 0);";
  const loop = "\n\t\tfor (let i = 0; i < partials.length; i++) {";
  const scaleBar = "\n\t\t\tthis._scaleBars(result);";
  const finalize = "\n\t\tthis._finalizeStaffSystem();";
  if (
    start < 0 ||
    end < 0 ||
    layout.split(repeated).length !== 2 ||
    layout.split(loop).length !== 2 ||
    layout.split(scaleBar).length !== 2 ||
    layout.split(finalize).length !== 2
  )
    throw new Error(
      "Recheck the alphaTab horizontal layout patch for this version.",
    );

  const withSpacing =
    source.slice(0, start) +
    layout
      .replace(repeated, "")
      .replace(scaleBar, "")
      .replace(
        finalize,
        `\n\t\t(${spaceHorizontalBars})(partials, MidiUtils.QuarterTime, this._system.accoladeWidth + this.pagePadding[0], ${quarterWidth}, ${firstBeatInset});${finalize}`,
      )
      .replace(loop, "\n\t\tthis._system.buildBoundingsLookup(0, 0);" + loop) +
    source.slice(end);

  // Some cross-staff grace notes are drawn beside a held note on one staff
  // and sound much later. Keep the playback line on the timing grid while
  // alphaTab highlights the sounding notes at their engraved positions.
  const cursorUpdate = "\n\t_internalCursorUpdateBeat(lookupResult, stop,";
  const cursorTarget = "nextBeatX = nextBeatBoundings.onNotesX;";
  const cursorOrigin = "let startBeatX = beatBoundings.onNotesX;";
  const cursorWidth =
    "const animationWidth = nextBeatX - beatBoundings.onNotesX;";
  const cursorPosition =
    "startBeatX = beatBoundings.onNotesX + animationWidth * ratioPosition;";
  for (const marker of [
    cursorUpdate,
    cursorTarget,
    cursorOrigin,
    cursorWidth,
    cursorPosition,
  ])
    if (withSpacing.split(marker).length !== 2)
      throw new Error(
        "Recheck the alphaTab horizontal cursor patch for this version.",
      );

  return withSpacing
    .replace(
      cursorUpdate,
      `
	_horizontalPlaybackX(lookup, beatBounds, boundsLookup, playing) {
		if (!playing || this.settings.display.layoutMode !== LayoutMode.Horizontal ||
			lookup.beat.graceType === GraceType.None || lookup.beat.graceGroup?.isComplete) return beatBounds.onNotesX;
		const rate = ${quarterWidth} * this.settings.display.scale / MidiUtils.QuarterTime;
		const lastGrace = lookup.beat.graceGroup?.beats.at(-1);
		const next = lastGrace?.nextBeat;
		if (next?.voice.bar.index === lookup.beat.voice.bar.index + 1) {
			const nextBounds = boundsLookup.findBeat(next);
			if (nextBounds) {
				const ticksUntilNext = lastGrace.playbackStart + lastGrace.playbackDuration - lookup.beat.playbackStart;
				return nextBounds.onNotesX - ticksUntilNext * rate;
			}
		}
		const master = lookup.masterBar;
		const bar = boundsLookup.findMasterBarByIndex(master.masterBar.index);
		if (!bar) return beatBounds.onNotesX;
		const scale = this.settings.display.scale;
		const tick = lookup.start - master.start;
		return bar.realBounds.x + ${firstBeatInset} * scale + tick * rate;
	}${cursorUpdate}`,
    )
    .replace(
      cursorTarget,
      "nextBeatX = this._horizontalPlaybackX(lookupResult.nextBeat, nextBeatBoundings, boundsLookup, isPlayingUpdate);",
    )
    .replace(
      cursorOrigin,
      "let startBeatX = this._horizontalPlaybackX(lookupResult, beatBoundings, boundsLookup, isPlayingUpdate);",
    )
    .replace(cursorWidth, "const animationWidth = nextBeatX - startBeatX;")
    .replace(cursorPosition, "startBeatX += animationWidth * ratioPosition;");
};
