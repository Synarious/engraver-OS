export type SidebarMode = "guitar" | "staff" | "both";
/** Rhythm, articulation, fingering and structure are shared by both workflows. */
export function paletteGroupVisible(mode: SidebarMode, group: string) {
  if (mode === "staff") return !["Guitar", "Picking"].includes(group);
  if (mode === "guitar") return !["Accidentals", "Ornaments"].includes(group);
  return true;
}

/** Pitched keyboard and percussion parts use staff controls regardless of a saved guitar palette. */
export function instrumentSidebarMode(
  type: string | undefined,
  preferred: SidebarMode,
): SidebarMode {
  return type === "piano" || type === "percussion" ? "staff" : preferred;
}
