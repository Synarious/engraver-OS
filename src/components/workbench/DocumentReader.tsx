"use client";
import { useEffect, useRef, useState } from "react";
import { askText } from "../../utils/dialog";
import { PdfSession } from "../../utils/pdfSession";
import { exportAnnotatedPDF } from "../../utils/annotatedPDF";
import {
  LibraryDocument,
  Annotation,
  putDocument,
} from "../../storage/fileSystem";
export function DocumentReader({
  document: initial,
  onChange,
  previousKey = "PageUp",
  nextKey = "PageDown",
}: {
  document: LibraryDocument;
  onChange: (d: LibraryDocument) => void;
  previousKey?: string;
  nextKey?: string;
}) {
  const [doc, setDoc] = useState(initial),
    [page, setPage] = useState(initial.page ?? 1),
    [count, setCount] = useState(1),
    [tool, setTool] = useState<"read" | "pen" | "highlight" | "text" | "erase">(
      "read",
    ),
    [color, setColor] = useState("#ef4444"),
    [error, setError] = useState(""),
    [zoom, setZoom] = useState(100),
    [history, setHistory] = useState<Annotation[][]>([]);
  const [redo, setRedo] = useState<Annotation[][]>([]),
    [layer, setLayer] = useState("Notes"),
    [visibleLayers, setVisibleLayers] = useState<string[] | null>(null);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [exporting, setExporting] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    surface = useRef<HTMLDivElement>(null),
    drawing = useRef<Annotation | null>(null),
    [preview, setPreview] = useState<Annotation | null>(null),
    [image, setImage] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(doc.original);
    // Resource allocation belongs to this effect; release it when the original changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImage(url);
    return () => URL.revokeObjectURL(url);
  }, [doc.original]);
  useEffect(() => {
    if (doc.kind !== "image" || !image) return;
    let cancelled = false;
    const bitmap = new Image();
    bitmap.onload = () => {
      if (cancelled || !canvas.current) return;
      const c = canvas.current,
        quarter = (doc.rotation ?? 0) % 180 !== 0;
      c.width = quarter ? bitmap.naturalHeight : bitmap.naturalWidth;
      c.height = quarter ? bitmap.naturalWidth : bitmap.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(((doc.rotation ?? 0) * Math.PI) / 180);
      ctx.drawImage(
        bitmap,
        -bitmap.naturalWidth / 2,
        -bitmap.naturalHeight / 2,
      );
    };
    bitmap.onerror = () => setError("Image could not be decoded.");
    bitmap.src = image;
    return () => {
      cancelled = true;
    };
  }, [doc.kind, doc.rotation, image]);
  useEffect(() => {
    if (doc.kind !== "pdf" || !image) return;
    let cancelled = false;
    const session = new PdfSession<import("pdfjs-dist").PDFDocumentProxy>();
    import("pdfjs-dist")
      .then(async (lib) => {
        lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await session.load(() =>
          lib.getDocument({
            url: image,
            cMapUrl: "/pdfjs/cmaps/",
            cMapPacked: true,
            standardFontDataUrl: "/pdfjs/standard_fonts/",
            wasmUrl: "/pdfjs/wasm/",
          }),
        );
        if (cancelled || !pdf) return;
        setCount(pdf.numPages);
        setPdfDocument(pdf);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
      void session.dispose();
    };
  }, [doc.kind, image]);
  useEffect(() => {
    if (!pdfDocument) return;
    let cancelled = false,
      task: any;
    (async () => {
      const sourcePage = doc.pageOrder?.[page - 1] ?? page;
      const sheet = await pdfDocument.getPage(
        Math.min(sourcePage, pdfDocument.numPages),
      );
      const viewport = sheet.getViewport({
        scale: 1.5,
        rotation: (sheet.rotate ?? 0) + (doc.rotation ?? 0),
      });
      if (cancelled || !canvas.current) return;
      const c = canvas.current;
      c.width = viewport.width;
      c.height = viewport.height;
      task = sheet.render({
        canvasContext: c.getContext("2d")!,
        canvas: c,
        viewport,
      });
      await task.promise;
    })().catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdfDocument, page, doc.rotation, doc.pageOrder]);
  const commit = async (next: LibraryDocument) => {
    setDoc(next);
    onChange(next);
    try {
      await putDocument(next);
    } catch (e) {
      setError(`Annotation save failed: ${String(e)}`);
    }
  };
  const changeAnnotations = (items: Annotation[]) => {
    setHistory((h) => [...h.slice(-49), doc.annotations ?? []]);
    setRedo([]);
    void commit({ ...doc, annotations: items });
  };
  const go = (n: number) => {
    const next = Math.max(1, Math.min(count, n));
    setPage(next);
    void commit({ ...doc, page: next });
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (["ArrowRight", nextKey].includes(e.key)) {
        e.preventDefault();
        go(page + 1);
      }
      if (["ArrowLeft", previousKey].includes(e.key)) {
        e.preventDefault();
        go(page - 1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const point = (e: React.PointerEvent) => {
    const r = surface.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  const down = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (tool === "read") {
      const pt = point(e);
      const boundary = doc.tapZones === "halves" ? 0.5 : 0.2;
      if (doc.tapZones !== "off") {
        if (pt.x < boundary) go(page - 1);
        else if (pt.x > 1 - boundary) go(page + 1);
      }
      return;
    }
    const pt = point(e);
    if (tool === "erase") {
      const candidates = (doc.annotations ?? []).filter(
        (a) => a.page === (doc.pageOrder?.[page - 1] ?? page),
      );
      const nearest = candidates
        .map((a) => ({
          a,
          d: Math.min(
            ...a.points.map((p) => Math.hypot(p.x - pt.x, p.y - pt.y)),
          ),
        }))
        .sort((a, b) => a.d - b.d)[0];
      if (nearest && nearest.d < 0.06)
        changeAnnotations(
          (doc.annotations ?? []).filter((a) => a.id !== nearest.a.id),
        );
      return;
    }
    if (tool === "text") {
      const text = await askText("Annotation text");
      if (text)
        changeAnnotations([
          ...(doc.annotations ?? []),
          {
            id: crypto.randomUUID(),
            page: doc.pageOrder?.[page - 1] ?? page,
            tool: "text",
            color,
            points: [pt],
            text,
            layer,
          },
        ]);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = {
      id: crypto.randomUUID(),
      page: doc.pageOrder?.[page - 1] ?? page,
      tool,
      color,
      points: [pt],
      layer,
    };
    setPreview({ ...drawing.current });
  };
  const finish = () => {
    if (drawing.current) {
      changeAnnotations([...(doc.annotations ?? []), drawing.current]);
      drawing.current = null;
      setPreview(null);
    }
  };
  const paths = [
    ...(doc.annotations ?? []).filter(
      (a) =>
        a.page === (doc.pageOrder?.[page - 1] ?? page) &&
        (!visibleLayers || visibleLayers.includes(a.layer ?? "Notes")),
    ),
    ...(preview ? [preview] : []),
  ];
  return (
    <div className="reader">
      <div className="toolbar wrap">
        <button onClick={() => go(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        <label>
          Page{" "}
          <input
            aria-label="Page number"
            type="number"
            min={1}
            max={count}
            value={page}
            onChange={(e) => go(Number(e.target.value))}
          />
        </label>
        <span>of {count}</span>
        <button onClick={() => go(page + 1)} disabled={page >= count}>
          Next
        </button>
        <label>
          Tool{" "}
          <select
            value={tool}
            onChange={(e) => setTool(e.target.value as typeof tool)}
          >
            {["read", "pen", "highlight", "text", "erase"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <input
          aria-label="Annotation color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <button
          disabled={!history.length}
          onClick={() => {
            const previous = history.at(-1)!;
            setRedo((r) => [...r, doc.annotations ?? []]);
            setHistory((h) => h.slice(0, -1));
            void commit({ ...doc, annotations: previous });
          }}
        >
          Undo annotation
        </button>
        <button
          disabled={!redo.length}
          onClick={() => {
            const next = redo.at(-1)!;
            setRedo((r) => r.slice(0, -1));
            setHistory((h) => [...h, doc.annotations ?? []]);
            void commit({ ...doc, annotations: next });
          }}
        >
          Redo annotation
        </button>
        <label>
          Layer{" "}
          <select value={layer} onChange={(e) => setLayer(e.target.value)}>
            {Array.from(new Set(["Notes", ...(doc.layers ?? [])])).map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <button
          onClick={async () => {
            const name = await askText("New annotation layer");
            if (name) {
              setLayer(name);
              void commit({
                ...doc,
                layers: Array.from(new Set([...(doc.layers ?? []), name])),
              });
            }
          }}
        >
          New layer
        </button>
        <button
          aria-pressed={visibleLayers !== null}
          onClick={() => setVisibleLayers(visibleLayers ? null : [layer])}
        >
          {visibleLayers ? "Show all layers" : "Show current layer"}
        </button>
        <label>
          Crop margins{" "}
          <input
            type="range"
            min={0}
            max={15}
            value={doc.crop ?? 0}
            onChange={(e) =>
              void commit({ ...doc, crop: Number(e.target.value) })
            }
          />
        </label>
        {doc.kind === "pdf" && (
          <button
            onClick={async () => {
              const order = await askText(
                "Page order (comma-separated page numbers)",
                (
                  doc.pageOrder ??
                  Array.from({ length: count }, (_, i) => i + 1)
                ).join(","),
              );
              if (order) {
                const pages = order.split(",").map(Number);
                if (
                  pages.length !== count ||
                  new Set(pages).size !== count ||
                  pages.some((n) => !Number.isInteger(n) || n < 1 || n > count)
                ) {
                  setError("Enter each original page number exactly once.");
                  return;
                }
                void commit({ ...doc, pageOrder: pages });
              }
            }}
          >
            Reorder pages
          </button>
        )}
        <button onClick={() => window.print()}>Print current page</button>
        <button
          disabled={!!exporting}
          onClick={async () => {
            try {
              setExporting("Preparing PDF…");
              await exportAnnotatedPDF(
                doc,
                pdfDocument,
                canvas.current,
                (page, total) => setExporting(`Exporting ${page}/${total}…`),
              );
            } catch (error) {
              setError(String(error));
            } finally {
              setExporting("");
            }
          }}
        >
          {exporting || "Export annotated PDF"}
        </button>
        <label>
          Tap turns{" "}
          <select
            value={doc.tapZones ?? "edges"}
            onChange={(e) =>
              void commit({
                ...doc,
                tapZones: e.target.value as LibraryDocument["tapZones"],
              })
            }
          >
            <option value="edges">Page edges</option>
            <option value="halves">Left/right halves</option>
            <option value="off">Off</option>
          </select>
        </label>
        {doc.kind === "pdf" && (
          <label>
            View{" "}
            <select
              value={doc.view ?? "single"}
              onChange={(e) =>
                void commit({
                  ...doc,
                  view: e.target.value as LibraryDocument["view"],
                })
              }
            >
              <option value="single">Single page</option>
              <option value="spread">Two pages</option>
              <option value="continuous">Continuous</option>
            </select>
          </label>
        )}
        <button
          onClick={async () => {
            const name = await askText("Bookmark name", `Page ${page}`);
            if (name)
              void commit({
                ...doc,
                bookmarks: [...(doc.bookmarks ?? []), { name, page }],
              });
          }}
        >
          Bookmark
        </button>
        <select
          aria-label="Bookmarks"
          value=""
          onChange={(e) => go(Number(e.target.value))}
        >
          <option value="">Bookmarks</option>
          {doc.bookmarks?.map((b, i) => (
            <option key={i} value={b.page}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            void commit({
              ...doc,
              rotation: ((doc.rotation ?? 0) + 90) % 360,
              annotations: doc.annotations?.map((a) => ({
                ...a,
                points: a.points.map((p) => ({ x: 1 - p.y, y: p.x })),
              })),
            })
          }
        >
          Rotate
        </button>
        <label>
          Zoom{" "}
          <input
            type="range"
            min={50}
            max={200}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className={`document-scroll view-${doc.view ?? "single"}`}>
        {doc.view === "continuous" &&
          Array.from({ length: page - 1 }, (_, i) => (
            <ExtraPage
              key={i}
              pdf={pdfDocument}
              page={i + 1}
              doc={doc}
              onOpen={() => go(i + 1)}
            />
          ))}
        <div
          ref={surface}
          className="document-page"
          style={{
            width: `${zoom}%`,
            clipPath: `inset(${doc.crop ?? 0}%)`,
            touchAction: tool === "read" ? "pan-x pan-y pinch-zoom" : "none",
          }}
          onPointerDown={down}
          onPointerMove={(e) => {
            if (drawing.current) {
              drawing.current.points.push(point(e));
              setPreview({
                ...drawing.current,
                points: [...drawing.current.points],
              });
            }
          }}
          onPointerUp={finish}
          onPointerCancel={() => {
            drawing.current = null;
            setPreview(null);
          }}
        >
          <canvas
            ref={canvas}
            role="img"
            aria-label={`${doc.title}, page ${page}`}
          />
          <svg
            className="annotation-layer"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
          >
            {paths.map((a) =>
              a.tool === "text" ? (
                <text
                  key={a.id}
                  x={a.points[0].x * 1000}
                  y={a.points[0].y * 1000}
                  fill={a.color}
                  fontSize={20}
                >
                  {a.text}
                </text>
              ) : (
                <polyline
                  key={a.id}
                  points={a.points
                    .map((p) => `${p.x * 1000},${p.y * 1000}`)
                    .join(" ")}
                  stroke={a.color}
                  strokeWidth={a.tool === "highlight" ? 24 : 3}
                  opacity={a.tool === "highlight" ? 0.3 : 1}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ),
            )}
          </svg>
        </div>
        {doc.view === "spread" && page < count && (
          <ExtraPage
            pdf={pdfDocument}
            page={page + 1}
            doc={doc}
            onOpen={() => go(page + 1)}
          />
        )}
        {doc.view === "continuous" &&
          Array.from({ length: count - page }, (_, i) => (
            <ExtraPage
              key={page + i + 1}
              pdf={pdfDocument}
              page={page + i + 1}
              doc={doc}
              onOpen={() => go(page + i + 1)}
            />
          ))}
      </div>
    </div>
  );
}

function ExtraPage({
  pdf,
  page,
  doc,
  onOpen,
}: {
  pdf: any;
  page: number;
  doc: LibraryDocument;
  onOpen: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "600px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf || !visible) return;
    let cancelled = false,
      task: any;
    (async () => {
      const sourcePage = doc.pageOrder?.[page - 1] ?? page,
        sheet = await pdf.getPage(sourcePage);
      if (cancelled || !canvas.current) return;
      const viewport = sheet.getViewport({
          scale: 1.25,
          rotation: (sheet.rotate ?? 0) + (doc.rotation ?? 0),
        }),
        c = canvas.current;
      c.width = viewport.width;
      c.height = viewport.height;
      task = sheet.render({
        canvas: c,
        canvasContext: c.getContext("2d")!,
        viewport,
      });
      await task.promise;
    })().catch((e) => {
      if (!cancelled) setError(String(e));
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, doc.pageOrder, doc.rotation, visible]);
  return (
    <div
      ref={container}
      className="document-page extra-page"
      style={{ minHeight: 400, clipPath: `inset(${doc.crop ?? 0}%)` }}
    >
      <button onClick={onOpen}>Open page {page} to annotate</button>
      <canvas ref={canvas} />
      <svg
        className="annotation-layer"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
      >
        {doc.annotations
          ?.filter((a) => a.page === (doc.pageOrder?.[page - 1] ?? page))
          .map((a) =>
            a.tool === "text" ? (
              <text
                key={a.id}
                x={a.points[0].x * 1000}
                y={a.points[0].y * 1000}
                fill={a.color}
                fontSize={20}
              >
                {a.text}
              </text>
            ) : (
              <polyline
                key={a.id}
                points={a.points
                  .map((p) => `${p.x * 1000},${p.y * 1000}`)
                  .join(" ")}
                stroke={a.color}
                strokeWidth={a.tool === "highlight" ? 24 : 3}
                opacity={a.tool === "highlight" ? 0.3 : 1}
                fill="none"
              />
            ),
          )}
      </svg>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
