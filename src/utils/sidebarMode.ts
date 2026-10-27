export type SidebarMode = "guitar" | "staff" | "both";
/** Rhythm, articulation, fingering and structure are shared by both workflows. */
export function paletteGroupVisible(mode: SidebarMode, group: string) {
  if (mode === "staff") return !["Guitar", "Picking"].includes(group);
  if (mode === "guitar") return !["Accidentals", "Ornaments"].includes(group);
  return true;
}
