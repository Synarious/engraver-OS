"use client";
import { useEffect, useRef, useState } from "react";
import type { LibraryItem } from "./Library";
import { PdfSession } from "../../utils/pdfSession";
export function LibraryThumbnail({ item }: { item: LibraryItem }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [visible, setVisible] = useState(false),
    [ready, setReady] = useState(false);
  const original = "kind" in item ? item.original : null;
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!original || !visible) return;
    let cancelled = false,
      task: any;
    const session = new PdfSession<import("pdfjs-dist").PDFDocumentProxy>();
    const url = URL.createObjectURL(original);
    (async () => {
      if ("kind" in item && item.kind === "pdf") {
        const lib = await import("pdfjs-dist");
        lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await session.load(() =>
          lib.getDocument({
            url,
            standardFontDataUrl: "/pdfjs/standard_fonts/",
            cMapUrl: "/pdfjs/cmaps/",
            cMapPacked: true,
            wasmUrl: "/pdfjs/wasm/",
          }),
        );
        if (cancelled || !pdf) return;
        const page = await pdf.getPage(1),
          size = page.getViewport({ scale: 1 }),
          viewport = page.getViewport({ scale: 240 / size.width });
        if (cancelled || !canvas.current) return;
        const c = canvas.current;
        c.width = viewport.width;
        c.height = viewport.height;
        task = page.render({
          canvas: c,
          canvasContext: c.getContext("2d")!,
          viewport,
        });
        await task.promise;
        if (!cancelled) setReady(true);
      } else {
        const image = new Image();
        image.onload = () => {
          if (cancelled || !canvas.current) return;
          const c = canvas.current;
          c.width = 240;
          c.height = (240 * image.naturalHeight) / image.naturalWidth;
          c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
          setReady(true);
        };
        image.src = url;
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
      task?.cancel();
      void session.dispose();
      URL.revokeObjectURL(url);
    };
    // Metadata does not change the original thumbnail bytes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, visible]);
  if ("kind" in item)
    return (
      <canvas
        ref={canvas}
        className="library-thumbnail"
        style={{ opacity: ready ? 1 : 0 }}
        aria-hidden="true"
      />
    );
  const notes =
    item.tracks[0]?.measures
      .flatMap((m) => m.voices[0]?.beats.flatMap((b) => b.notes) ?? [])
      .slice(0, 12) ?? [];
  return (
    <svg viewBox="0 0 260 85" className="notation-thumbnail" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={0}
          x2={260}
          y1={20 + i * 9}
          y2={20 + i * 9}
          stroke="#98a2aa"
        />
      ))}
      <text x={4} y={62} fontSize={60}>
        𝄞
      </text>
      {notes.map((n, i) => {
        const y = Math.max(8, Math.min(72, 58 - (n.pitch - 60) * 2));
        return (
          <g key={i}>
            <ellipse
              cx={45 + i * 17}
              cy={y}
              rx={5}
              ry={3.5}
              transform={`rotate(-20 ${45 + i * 17} ${y})`}
            />
            <line
              x1={50 + i * 17}
              x2={50 + i * 17}
              y1={y}
              y2={y - 25}
              stroke="currentColor"
            />
          </g>
        );
      })}
    </svg>
  );
}
