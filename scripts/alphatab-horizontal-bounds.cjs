// alphaTab 1.8.4 builds the bounds of the entire horizontal system once per
// SVG partial. Build them once while keeping each SVG partial lazy.
module.exports = function fixHorizontalBounds(source) {
  const start = source.indexOf(
    "class HorizontalScreenLayout extends ScoreLayout",
  );
  const end = source.indexOf("//#endregion", start);
  const layout = source.slice(start, end);
  const repeated = "\n\t\t\tthis._system.buildBoundingsLookup(0, 0);";
  const loop = "\n\t\tfor (let i = 0; i < partials.length; i++) {";
  if (
    start < 0 ||
    end < 0 ||
    layout.split(repeated).length !== 2 ||
    layout.split(loop).length !== 2
  )
    throw new Error(
      "Recheck the alphaTab horizontal bounds fix for this version.",
    );

  return (
    source.slice(0, start) +
    layout
      .replace(repeated, "")
      .replace(loop, "\n\t\tthis._system.buildBoundingsLookup(0, 0);" + loop) +
    source.slice(end)
  );
};
