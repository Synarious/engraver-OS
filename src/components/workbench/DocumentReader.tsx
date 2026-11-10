"use client";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { askText } from "../../utils/dialog";
import { PdfSession } from "../../utils/pdfSession";
import { exportAnnotatedPDF } from "../../utils/annotatedPDF";
import { pageTapDirection, pdfCanvasScale } from "../../utils/pdfReader";
import {
  LibraryDocument,
  Annotation,
  putDocument,
} from "../../storage/fileSystem";
import styles from "./DocumentReader.module.css";

type Point = { x: number; y: number };

const modalOpen = () =>
  !!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');

function usePdfPage(
  canvas: RefObject<HTMLCanvasElement | null>,
  pdf: PDFDocumentProxy | null,
  sourcePage: number,
  rotation: number,
  visible: boolean,
  setError: (message: string) => void,
) {
  useEffect(() => {
    const element = canvas.current;
    if (!pdf || !element) return;
    if (!visible) {
      // Retain the page's CSS aspect ratio but release its offscreen bitmap.
      element.setAttribute("width", "1");
      element.setAttribute("height", "1");
      return;
    }
    let disposed = false,
      task: RenderTask | undefined,
      frame = 0,
      lastScale = 0,
      observer: ResizeObserver | undefined,
      stopWatchingResolution: (() => void) | undefined;
    const renderPage = async () => {
      const page = await pdf.getPage(Math.min(sourcePage, pdf.numPages));
      if (disposed) return;
      const options = { rotation: page.rotate + rotation };
      const base = page.getViewport({ ...options, scale: 1 });
      element.style.setProperty(
        "aspect-ratio",
        `${base.width} / ${base.height}`,
      );
      const render = async () => {
        frame = 0;
        const width = element.clientWidth;
        if (disposed || !width) return;
        const scale = pdfCanvasScale(
          base.width,
          base.height,
          width,
          window.devicePixelRatio || 1,
        );
        if (scale === lastScale) return;
        lastScale = scale;
        task?.cancel();
        const viewport = page.getViewport({ ...options, scale });
        element.setAttribute(
          "width",
          String(Math.max(1, Math.floor(viewport.width))),
        );
        element.setAttribute(
          "height",
          String(Math.max(1, Math.floor(viewport.height))),
        );
        const next = page.render({ canvas: element, viewport });
        task = next;
        await next.promise.catch((error: Error) => {
          if (
            !disposed &&
            task === next &&
            error.name !== "RenderingCancelledException"
          )
            setError(error.message);
        });
      };
      const queueRender = () => {
        if (!frame) {
          frame = window.requestAnimationFrame(() => {
            void render().catch((error) => {
              if (!disposed) setError(String(error));
            });
          });
        }
      };
      const watchResolution = () => {
        stopWatchingResolution?.();
        const resolution = window.matchMedia(
          `(resolution: ${window.devicePixelRatio || 1}dppx)`,
        );
        resolution.addEventListener("change", watchResolution);
        stopWatchingResolution = () =>
          resolution.removeEventListener("change", watchResolution);
        queueRender();
      };
      observer = new ResizeObserver(queueRender);
      observer.observe(element);
      watchResolution();
    };
    void renderPage().catch((error) => {
      if (!disposed) setError(String(error));
    });
    return () => {
      disposed = true;
      task?.cancel();
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      stopWatchingResolution?.();
    };
  }, [canvas, pdf, sourcePage, rotation, visible, setError]);
}

function AnnotationLayer({ annotations }: { annotations: Annotation[] }) {
  return (
    <svg
      className="annotation-layer"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
    >
      {annotations.map((a) =>
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
  );
}

function pageAnnotations(
  doc: LibraryDocument,
  sourcePage: number,
  layer: string | null,
) {
  return (doc.annotations ?? []).filter(
    (annotation) =>
      annotation.page === sourcePage &&
      annotation.points.length &&
      (layer === null || (annotation.layer ?? "Notes") === layer),
  );
}
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
    [showCurrentLayer, setShowCurrentLayer] = useState(false),
    [moreOpen, setMoreOpen] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [exporting, setExporting] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    surface = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    more = useRef<HTMLDivElement>(null),
    moreButton = useRef<HTMLButtonElement>(null),
    readTap = useRef<{ id: number; start: Point } | null>(null),
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
    const session = new PdfSession<PDFDocumentProxy>();
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
  const sourcePage = doc.pageOrder?.[page - 1] ?? page;
  const visibleLayer = showCurrentLayer ? layer : null;
  usePdfPage(
    canvas,
    pdfDocument,
    sourcePage,
    doc.rotation ?? 0,
    true,
    setError,
  );
  useEffect(() => {
    const viewport = scroll.current;
    if (!viewport || !surface.current) return;
    viewport.scrollTop =
      doc.view === "continuous" ? surface.current.offsetTop : 0;
  }, [page, doc.view]);
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
    if (next === page) return;
    setPage(next);
    void commit({ ...doc, page: next });
  };
  useEffect(() => {
    if (!moreOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (modalOpen()) return;
      if (event.target instanceof Node && !more.current?.contains(event.target))
        setMoreOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape" || modalOpen())
        return;
      setMoreOpen(false);
      moreButton.current?.focus();
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, [moreOpen]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        moreOpen ||
        modalOpen() ||
        surface.current?.closest("[inert]") ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
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
    readTap.current = null;
    if (!e.isPrimary || e.button !== 0) return;
    if (tool === "read") {
      readTap.current = {
        id: e.pointerId,
        start: { x: e.clientX, y: e.clientY },
      };
      return;
    }
    const pt = point(e);
    if (tool === "erase") {
      const candidates = pageAnnotations(doc, sourcePage, visibleLayer);
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
            page: sourcePage,
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
      page: sourcePage,
      tool,
      color,
      points: [pt],
      layer,
    };
    setPreview({ ...drawing.current });
  };
  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    const tap = readTap.current;
    readTap.current = null;
    if (tap?.id === e.pointerId && tool === "read") {
      const direction = pageTapDirection(
        tap.start,
        { x: e.clientX, y: e.clientY },
        e.currentTarget.getBoundingClientRect(),
        doc.tapZones,
      );
      if (direction) go(page + direction);
    }
    if (drawing.current) {
      changeAnnotations([...(doc.annotations ?? []), drawing.current]);
      drawing.current = null;
      setPreview(null);
    }
  };
  const paths = [
    ...pageAnnotations(doc, sourcePage, visibleLayer),
    ...(preview ? [preview] : []),
  ];
  return (
    <div className="reader">
      <div className={styles.toolbar}>
        <div className={styles.primaryTools}>
          <div
            className={styles.controlGroup}
            role="group"
            aria-label="Page navigation"
          >
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => go(page - 1)}
              disabled={page <= 1}
            >
              ‹
            </button>
            <label className={styles.pageNumber}>
              <span className={styles.pageLabel}>Page</span>
              <input
                aria-label="Page number"
                type="number"
                min={1}
                max={count}
                value={page}
                onChange={(e) => go(Number(e.target.value))}
              />
              <span>/ {count}</span>
            </label>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => go(page + 1)}
              disabled={page >= count}
            >
              ›
            </button>
          </div>
          <div
            className={styles.controlGroup}
            role="group"
            aria-label="Document zoom"
          >
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((value) => Math.max(50, value - 10))}
              disabled={zoom <= 50}
            >
              −
            </button>
            <button
              type="button"
              aria-label={`Reset document zoom, currently ${zoom}%`}
              onClick={() => setZoom(100)}
            >
              {zoom}%
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((value) => Math.min(200, value + 10))}
              disabled={zoom >= 200}
            >
              +
            </button>
          </div>
          <div className={styles.modeTools}>
            <button
              type="button"
              aria-expanded={tool !== "read"}
              aria-controls="annotation-tools"
              onClick={() =>
                setTool((value) => (value === "read" ? "pen" : "read"))
              }
            >
              {tool === "read" ? "Annotate" : "Done annotating"}
            </button>
            <div ref={more} className={styles.more}>
              <button
                ref={moreButton}
                type="button"
                aria-expanded={moreOpen}
                aria-controls="document-options"
                onClick={() => setMoreOpen((open) => !open)}
              >
                More
              </button>
              {moreOpen && (
                <div
                  id="document-options"
                  className={styles.morePanel}
                  role="region"
                  aria-label="Document options"
                >
                  <div className={styles.optionRow}>
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
                    <label>
                      Tap turns{" "}
                      <select
                        value={doc.tapZones ?? "edges"}
                        onChange={(e) =>
                          void commit({
                            ...doc,
                            tapZones: e.target
                              .value as LibraryDocument["tapZones"],
                          })
                        }
                      >
                        <option value="edges">Page edges</option>
                        <option value="halves">Left/right halves</option>
                        <option value="off">Off</option>
                      </select>
                    </label>
                  </div>
                  <div className={styles.optionRow}>
                    <button
                      type="button"
                      onClick={async () => {
                        const name = await askText(
                          "Bookmark name",
                          `Page ${page}`,
                        );
                        if (name)
                          void commit({
                            ...doc,
                            bookmarks: [
                              ...(doc.bookmarks ?? []),
                              { name, page },
                            ],
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
                  </div>
                  <div className={styles.optionRow}>
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
                    <button
                      type="button"
                      onClick={() =>
                        void commit({
                          ...doc,
                          rotation: ((doc.rotation ?? 0) + 90) % 360,
                          annotations: doc.annotations?.map((a) => ({
                            ...a,
                            points: a.points.map((p) => ({
                              x: 1 - p.y,
                              y: p.x,
                            })),
                          })),
                        })
                      }
                    >
                      Rotate
                    </button>
                    {doc.kind === "pdf" && (
                      <button
                        type="button"
                        onClick={async () => {
                          const order = await askText(
                            "Page order (comma-separated page numbers)",
                            (
                              doc.pageOrder ??
                              Array.from({ length: count }, (_, i) => i + 1)
                            ).join(","),
                          );
                          if (!order) return;
                          const pages = order.split(",").map(Number);
                          if (
                            pages.length !== count ||
                            new Set(pages).size !== count ||
                            pages.some(
                              (n) => !Number.isInteger(n) || n < 1 || n > count,
                            )
                          ) {
                            setError(
                              "Enter each original page number exactly once.",
                            );
                            return;
                          }
                          setError("");
                          void commit({ ...doc, pageOrder: pages });
                        }}
                      >
                        Reorder pages
                      </button>
                    )}
                  </div>
                  <div className={styles.optionRow}>
                    <button type="button" onClick={() => window.print()}>
                      Print current page
                    </button>
                    <button
                      type="button"
                      disabled={!!exporting}
                      onClick={async () => {
                        try {
                          setExporting("Preparing PDF…");
                          await exportAnnotatedPDF(
                            doc,
                            pdfDocument,
                            canvas.current,
                            (page, total) =>
                              setExporting(`Exporting ${page}/${total}…`),
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
                  </div>
                  <p className="document-export-hint">
                    Annotated export flattens pages into images. Use Original in
                    the library to retain text and artwork.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        {tool !== "read" && (
          <div
            id="annotation-tools"
            className={styles.annotationTools}
            role="group"
            aria-label="Annotation tools"
          >
            <label>
              Tool{" "}
              <select
                value={tool}
                onChange={(e) => setTool(e.target.value as typeof tool)}
              >
                {["pen", "highlight", "text", "erase"].map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
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
                {Array.from(new Set(["Notes", ...(doc.layers ?? [])])).map(
                  (l) => (
                    <option key={l}>{l}</option>
                  ),
                )}
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
              aria-pressed={showCurrentLayer}
              onClick={() => setShowCurrentLayer((value) => !value)}
            >
              {showCurrentLayer ? "Show all layers" : "Show current layer"}
            </button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div
        ref={scroll}
        className={`document-scroll view-${doc.view ?? "single"} ${styles.documentScroll}`}
        style={{ "--document-zoom": `${zoom}%` } as CSSProperties}
      >
        {doc.view === "continuous" &&
          Array.from({ length: page - 1 }, (_, i) => (
            <ExtraPage
              key={i}
              pdf={pdfDocument}
              page={i + 1}
              doc={doc}
              layer={visibleLayer}
              root={scroll}
              onOpen={() => go(i + 1)}
            />
          ))}
        <div
          ref={surface}
          className="document-page"
          style={{
            width: "var(--document-zoom)",
            clipPath: `inset(${doc.crop ?? 0}%)`,
            touchAction: tool === "read" ? "pan-x pan-y pinch-zoom" : "none",
          }}
          onPointerDown={down}
          onPointerMove={(e) => {
            const tap = readTap.current;
            if (
              tap?.id === e.pointerId &&
              Math.hypot(e.clientX - tap.start.x, e.clientY - tap.start.y) > 10
            )
              readTap.current = null;
            if (drawing.current && e.isPrimary) {
              drawing.current.points.push(point(e));
              setPreview({
                ...drawing.current,
                points: [...drawing.current.points],
              });
            }
          }}
          onPointerUp={finish}
          onPointerLeave={() => {
            readTap.current = null;
          }}
          onPointerCancel={() => {
            readTap.current = null;
            drawing.current = null;
            setPreview(null);
          }}
        >
          <canvas
            ref={canvas}
            className={doc.kind === "pdf" ? styles.pdfPage : undefined}
            role="img"
            aria-label={`${doc.title}, page ${page}`}
          />
          <AnnotationLayer annotations={paths} />
        </div>
        {doc.view === "spread" && page < count && (
          <ExtraPage
            pdf={pdfDocument}
            page={page + 1}
            doc={doc}
            layer={visibleLayer}
            root={scroll}
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
              layer={visibleLayer}
              root={scroll}
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
  layer,
  root,
  onOpen,
}: {
  pdf: PDFDocumentProxy | null;
  page: number;
  doc: LibraryDocument;
  layer: string | null;
  root: RefObject<HTMLDivElement | null>;
  onOpen: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: root.current, rootMargin: "300px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [root]);
  const sourcePage = doc.pageOrder?.[page - 1] ?? page;
  usePdfPage(canvas, pdf, sourcePage, doc.rotation ?? 0, visible, setError);
  return (
    <div
      ref={container}
      className="document-page extra-page"
      style={{
        width: "var(--document-zoom)",
        clipPath: `inset(${doc.crop ?? 0}%)`,
      }}
    >
      <button type="button" onClick={onOpen}>
        Open page {page}
      </button>
      <canvas
        ref={canvas}
        className={styles.pdfPage}
        role="img"
        aria-label={`${doc.title}, page ${page}`}
      />
      <AnnotationLayer annotations={pageAnnotations(doc, sourcePage, layer)} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
