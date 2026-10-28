/** Join byte-exact chunks so the sound bank fits static-host file limits. */
export async function loadPianoSoundfont(): Promise<Uint8Array> {
  const parts = await Promise.all(
    [1, 2].map(async (part) => {
      const response = await fetch(`/soundfont/generaluser.sf2.part${part}`);
      if (!response.ok)
        throw new Error(
          "Unable to load instrument sounds. Check your connection and reload the score.",
        );
      return new Uint8Array(await response.arrayBuffer());
    }),
  );
  const bank = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    bank.set(part, offset);
    offset += part.length;
  }
  return bank;
}
