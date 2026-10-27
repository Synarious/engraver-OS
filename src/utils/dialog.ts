export function askText(title: string, initial = ""): Promise<string | null> {
  return new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent("engraver-prompt", {
        detail: { title, initial, resolve },
      }),
    ),
  );
}
