import { ScoreAST, BeatAST, TrackAST } from "../types/score";
/** Standard MIDI format 0/1 import, quantized to sixteenths with tied sustains. */
export function parseMidi(buffer: ArrayBuffer, filename: string): ScoreAST {
  const data = new DataView(buffer);
  let p = 0;
  const str = (n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(data.getUint8(p++));
    return s;
  };
  const u16 = () => {
    const v = data.getUint16(p);
    p += 2;
    return v;
  };
  const u32 = () => {
    const v = data.getUint32(p);
    p += 4;
    return v;
  };
  const vlq = () => {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = data.getUint8(p++);
      v = (v << 7) | (b & 127);
      if (!(b & 128)) return v;
    }
    throw new Error("Invalid MIDI variable integer");
  };
  if (str(4) !== "MThd") throw new Error("Not a MIDI file");
  const header = u32(),
    format = u16(),
    trackCount = u16(),
    division = u16();
  if (format > 1 || division & 0x8000 || !division)
    throw new Error("MIDI format 2 and SMPTE timing are not supported.");
  p = 8 + header;
  let tempo = 120;
  const signature: [number, number] = [4, 4];
  const tracks: TrackAST[] = [];
  const tempoChanges: { tick: number; value: number }[] = [],
    meters: { tick: number; value: [number, number] }[] = [];
  let maxTick = 0;
  for (let ti = 0; ti < trackCount; ti++) {
    if (str(4) !== "MTrk") throw new Error("Invalid MIDI track");
    const length = u32(),
      end = p + length;
    if (end > data.byteLength) throw new Error("Truncated MIDI track");
    let tick = 0,
      running = 0,
      name = `Track ${ti + 1}`;
    const programs = new Map<number, number>(),
      active = new Map<string, number[]>();
    const notes: {
      start: number;
      end: number;
      pitch: number;
      channel: number;
    }[] = [];
    while (p < end) {
      tick += vlq();
      let status = data.getUint8(p);
      if (status & 128) {
        p++;
        if (status < 240) running = status;
      } else status = running;
      if (!status) throw new Error("Invalid MIDI running status");
      if (status === 255) {
        const type = data.getUint8(p++),
          size = vlq(),
          start = p;
        p += size;
        if (p > end) throw new Error("Truncated MIDI event");
        if (type === 3)
          name = new TextDecoder().decode(new Uint8Array(buffer, start, size));
        if (type === 81 && size === 3) {
          const value = Math.round(
            60000000 /
              ((data.getUint8(start) << 16) |
                (data.getUint8(start + 1) << 8) |
                data.getUint8(start + 2)),
          );
          if (!Number.isFinite(value) || value <= 0)
            throw new Error("Invalid MIDI tempo");
          tempoChanges.push({ tick, value });
          if (tick === 0) tempo = value;
        }
        if (type === 88 && size >= 2) {
          const value: [number, number] = [
            data.getUint8(start),
            2 ** data.getUint8(start + 1),
          ];
          if (!value[0] || value[1] > 64)
            throw new Error("Invalid MIDI time signature");
          meters.push({ tick, value });
          if (tick === 0) {
            signature[0] = value[0];
            signature[1] = value[1];
          }
        }
        continue;
      }
      if (status === 240 || status === 247) {
        p += vlq();
        running = 0;
        continue;
      }
      if (status >= 240) throw new Error("Unsupported MIDI system event");
      const channel = status & 15,
        type = status >> 4,
        x = data.getUint8(p++),
        y = type === 12 || type === 13 ? 0 : data.getUint8(p++);
      if (type === 12) programs.set(channel, x);
      const key = `${channel}:${x}`;
      if (type === 9 && y > 0) {
        const stack = active.get(key) ?? [];
        stack.push(tick);
        active.set(key, stack);
      }
      if (type === 8 || (type === 9 && y === 0)) {
        const start = active.get(key)?.shift();
        if (start !== undefined)
          notes.push({
            start,
            end: Math.max(start + 1, tick),
            pitch: x,
            channel,
          });
      }
    }
    for (const [key, starts] of active) {
      const [channel, pitch] = key.split(":").map(Number);
      for (const start of starts)
        notes.push({ start, end: Math.max(start + 1, tick), channel, pitch });
    }
    maxTick = Math.max(maxTick, tick, ...notes.map((n) => n.end));
    for (const channel of new Set(notes.map((n) => n.channel))) {
      const own = notes.filter((n) => n.channel === channel);
      const step = division / 4,
        slotsPerMeasure = Math.max(
          1,
          Math.round((signature[0] * 16) / signature[1]),
        );
      const slots = Math.ceil(Math.max(...own.map((n) => n.end)) / step);
      const beats: BeatAST[] = Array.from(
        { length: Math.ceil(slots / slotsPerMeasure) * slotsPerMeasure },
        (_, i) => ({
          id: crypto.randomUUID(),
          duration: "s",
          isDotted: false,
          isTuplet: false,
          notes: own
            .filter(
              (n) =>
                Math.round(n.start / step) <= i &&
                Math.max(
                  Math.round(n.start / step) + 1,
                  Math.round(n.end / step),
                ) > i,
            )
            .map((n) => ({
              id: crypto.randomUUID(),
              pitch: n.pitch,
              isTied: Math.round(n.start / step) < i,
            })),
        }),
      );
      tracks.push({
        id: crypto.randomUUID(),
        name: programs.size > 1 ? `${name} · channel ${channel + 1}` : name,
        type: channel === 9 ? "percussion" : "piano",
        midiProgram: programs.get(channel) ?? 0,
        isMuted: false,
        isSolo: false,
        volume: 0.8,
        pan: 0,
        measures: Array.from(
          { length: beats.length / slotsPerMeasure },
          (_, i) => ({
            index: i,
            voices: [
              {
                index: 0,
                beats: beats.slice(
                  i * slotsPerMeasure,
                  (i + 1) * slotsPerMeasure,
                ),
              },
            ],
          }),
        ),
      });
    }
  }
  if (!tracks.length || !maxTick) throw new Error("MIDI contains no notes");
  meters.sort((a, b) => a.tick - b.tick);
  tempoChanges.sort((a, b) => a.tick - b.tick);
  for (const track of tracks) {
    const beats = track.measures.flatMap((m) => m.voices[0].beats);
    track.measures = [];
    let offset = 0;
    while (offset < Math.ceil(maxTick / (division / 4))) {
      const tick = (offset * division) / 4,
        meter = meters.filter((m) => m.tick <= tick).at(-1)?.value ?? signature;
      const slots = Math.max(1, Math.round((meter[0] * 16) / meter[1])),
        length = (slots * division) / 4;
      const automations = tempoChanges
        .filter((t) => t.tick >= tick && t.tick < tick + length)
        .map((t) => ({
          type: 0,
          value: t.value,
          ratioposition: (t.tick - tick) / length,
        }));
      const slice = Array.from(
        { length: slots },
        (_, i) =>
          beats[offset + i] ?? {
            id: crypto.randomUUID(),
            duration: "s" as const,
            isDotted: false,
            isTuplet: false,
            notes: [],
          },
      );
      track.measures.push({
        index: track.measures.length,
        timeSignature: meter,
        masterSource: { tempoautomations: automations },
        tempo:
          automations[0]?.ratioposition === 0
            ? automations[0].value
            : undefined,
        voices: [{ index: 0, beats: slice }],
      });
      offset += slots;
    }
  }
  return {
    id: crypto.randomUUID(),
    version: 1,
    title: filename.replace(/\.[^.]+$/, ""),
    tempo,
    timeSignature: signature,
    tracks,
  };
}
