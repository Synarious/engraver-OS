import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { unzipSync, zipSync, strToU8 } from "fflate";

export const elements = (e: any, name?: string): any[] =>
  Array.from(e?.childNodes ?? []).filter(
    (n: any) => n.nodeType === 1 && (!name || n.localName === name),
  );
export const first = (e: any, name: string) => elements(e, name)[0];
export const content = (e: any, name: string): string =>
  first(e, name)?.textContent ?? "";
export const serializeXML = (e: any): string =>
  new XMLSerializer().serializeToString(e);
export const parseXML = (source: string) =>
  new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new Error(`Invalid MusicXML: ${message}`);
    },
  }).parseFromString(source, "application/xml");

function decode(bytes: Uint8Array) {
  const utf16 =
    (bytes[0] === 255 && bytes[1] === 254) ||
    (bytes[0] === 60 && bytes[1] === 0)
      ? "utf-16le"
      : (bytes[0] === 254 && bytes[1] === 255) ||
          (bytes[0] === 0 && bytes[1] === 60)
        ? "utf-16be"
        : undefined;
  const header = new TextDecoder("ascii").decode(bytes.slice(0, 256));
  const encoding =
    utf16 ?? header.match(/encoding\s*=\s*["']([^"']+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      `MusicXML text could not be decoded as ${encoding}. Save it as UTF-8 and import it again.`,
    );
  }
}

export function readMusicXML(bytes: Uint8Array): string | null {
  if (bytes[0] === 80 && bytes[1] === 75) {
    const containers = unzipSync(bytes, {
      filter: (e) =>
        e.name === "META-INF/container.xml" && e.originalSize < 1024 * 1024,
    });
    const container = containers["META-INF/container.xml"];
    if (!container) return null; // Guitar Pro archives use a different container.
    const doc = parseXML(decode(container));
    const roots = Array.from(doc.getElementsByTagName("rootfile"));
    const root =
      roots.find(
        (e) =>
          e.getAttribute("media-type") ===
          "application/vnd.recordare.musicxml+xml",
      ) ?? roots[0];
    const path = root?.getAttribute("full-path");
    if (!path)
      throw new Error(
        "This MXL file does not identify its score in META-INF/container.xml.",
      );
    const files = unzipSync(bytes, {
      filter: (e) => e.name === path! && e.originalSize <= 32 * 1024 * 1024,
    });
    if (!files[path])
      throw new Error(
        "The MXL score is missing or exceeds the 32 MiB import limit.",
      );
    return decode(files[path!]);
  }
  // Avoid interpreting Guitar Pro binaries as text.
  if (!(
    bytes[0] === 60 ||
    bytes[0] === 239 ||
    bytes[0] === 255 ||
    bytes[0] === 254 ||
    bytes[0] === 0 ||
    [9, 10, 13, 32].includes(bytes[0])
  ))
    return null;
  const source = decode(bytes);
  if (!source.trimStart().startsWith("<")) return null;
  return source;
}

/** Normalize valid voice identifiers and timewise organization before alphaTab reads them. */
export function prepareMusicXML(bytes: Uint8Array) {
  const source = readMusicXML(bytes);
  if (source === null) return null;
  const doc = parseXML(source);
  let root = doc.documentElement;
  if (
    !root ||
    !["score-partwise", "score-timewise"].includes(root.localName ?? "")
  )
    return null;
  if (root.localName === "score-timewise") {
    const replacement = doc.createElement("score-partwise");
    replacement.setAttribute("version", root.getAttribute("version") || "4.0");
    for (const node of elements(root).filter((n) => n.localName !== "measure"))
      replacement.appendChild(node.cloneNode(true));
    const ids = elements(first(root, "part-list"), "score-part").map((p) =>
      p.getAttribute("id"),
    );
    for (const id of ids) {
      const part = doc.createElement("part");
      part.setAttribute("id", id);
      for (const m of elements(root, "measure")) {
        const measure = doc.createElement("measure");
        for (const attr of Array.from(m.attributes) as any[])
          measure.setAttribute(attr.name, attr.value);
        const original = elements(m, "part").find(
          (p) => p.getAttribute("id") === id,
        );
        for (const child of Array.from(original?.childNodes ?? []) as any[])
          measure.appendChild(child.cloneNode(true));
        part.appendChild(measure);
      }
      replacement.appendChild(part);
    }
    doc.replaceChild(replacement, root);
    root = replacement;
  }
  for (const part of elements(root, "part")) {
    // alphaTab sizes its string array from staff-lines. A five-line standard
    // staff can still describe six guitar strings; retain the original geometry.
    for (const measure of elements(part, "measure"))
      for (const attributes of elements(measure, "attributes"))
        for (const details of elements(attributes, "staff-details")) {
          const tunings = elements(details, "staff-tuning");
          const count = Math.max(
            0,
            ...tunings.map((t) => Number(t.getAttribute("line"))),
          );
          let lines = first(details, "staff-lines");
          if (count && Number(lines?.textContent || 5) !== count) {
            details.setAttribute(
              "data-engraver-staff-lines",
              lines?.textContent || "5",
            );
            if (!lines) {
              lines = doc.createElement("staff-lines");
              details.insertBefore(lines, details.firstChild);
            }
            lines.textContent = String(count);
          }
        }
    const voices = new Map<string, Map<string, number>>();
    let divisions = 1;
    for (const measure of elements(part, "measure")) {
      for (const e of elements(measure)) {
        if (e.localName === "attributes")
          divisions = Number(content(e, "divisions")) || divisions;
        if (e.localName === "direction") {
          const offset = first(e, "offset");
          if (offset && !offset.hasAttribute("data-engraver-ticks")) {
            offset.textContent = String(
              (Number(offset.textContent) * 960) / divisions,
            );
            offset.setAttribute("data-engraver-ticks", "yes");
          }
        }
      }
      for (const event of elements(measure).filter((e) =>
        ["note", "forward", "direction"].includes(e.localName),
      )) {
        const staff = content(event, "staff") || "1";
        let voice = first(event, "voice");
        if (!voice && event.localName !== "note") continue;
        const id = voice?.textContent || "1";
        const map = voices.get(staff) ?? new Map<string, number>();
        voices.set(staff, map);
        if (!map.has(id)) map.set(id, map.size + 1);
        event.setAttribute("data-engraver-voice", id);
        if (!voice) {
          voice = doc.createElement("voice");
          event.appendChild(voice);
        }
        voice.textContent = String(map.get(id));
      }
    }
  }
  return serializeXML(doc).replace(
    /encoding\s*=\s*["'][^"']+["']/i,
    'encoding="utf-8"',
  );
}

export function compressMusicXML(xml: string) {
  return zipSync({
    mimetype: [strToU8("application/vnd.recordare.musicxml"), { level: 0 }],
    "META-INF/container.xml": strToU8(
      '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>',
    ),
    "score.musicxml": strToU8(xml),
  });
}
