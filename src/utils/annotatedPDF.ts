import { LibraryDocument, download } from "../storage/fileSystem";
/** Flatten locally rendered pages and every annotation layer into a portable PDF. */
export async function exportAnnotatedPDF(
  doc: LibraryDocument,
  pdf: any,
  imageCanvas: HTMLCanvasElement | null,
  onProgress: (page: number, total: number) => void,
) {
  const { PDFDocument } = await import("pdf-lib");
  const output = await PDFDocument.create(),
    count = doc.kind === "pdf" ? (pdf?.numPages ?? 0) : 1;
  if (!count) throw new Error("Wait for the document to finish loading.");
  for (let index = 0; index < count; index++) {
    onProgress(index + 1, count);
    const sourcePage = doc.pageOrder?.[index] ?? index + 1,
      c = document.createElement("canvas");
    if (doc.kind === "pdf") {
      const page = await pdf.getPage(sourcePage),
        viewport = page.getViewport({
          scale: 1.5,
          rotation: (page.rotate ?? 0) + (doc.rotation ?? 0),
        });
      c.width = viewport.width;
      c.height = viewport.height;
      await page.render({
        canvas: c,
        canvasContext: c.getContext("2d")!,
        viewport,
      }).promise;
    } else {
      if (!imageCanvas) throw new Error("Image is not ready.");
      c.width = imageCanvas.width;
      c.height = imageCanvas.height;
      c.getContext("2d")!.drawImage(imageCanvas, 0, 0);
    }
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.scale(c.width / 1000, c.height / 1000);
    for (const annotation of doc.annotations ?? []) {
      if (annotation.page !== sourcePage || !annotation.points.length) continue;
      ctx.strokeStyle = annotation.color;
      ctx.fillStyle = annotation.color;
      ctx.globalAlpha = annotation.tool === "highlight" ? 0.3 : 1;
      ctx.lineWidth = annotation.tool === "highlight" ? 24 : 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (annotation.tool === "text") {
        ctx.font = "20px sans-serif";
        ctx.fillText(
          annotation.text ?? "",
          annotation.points[0].x * 1000,
          annotation.points[0].y * 1000,
        );
      } else {
        ctx.beginPath();
        ctx.moveTo(
          annotation.points[0].x * 1000,
          annotation.points[0].y * 1000,
        );
        for (const point of annotation.points.slice(1))
          ctx.lineTo(point.x * 1000, point.y * 1000);
        ctx.stroke();
      }
    }
    ctx.restore();
    const margin = (doc.crop ?? 0) / 100,
      flattened = document.createElement("canvas");
    flattened.width = Math.round(c.width * (1 - 2 * margin));
    flattened.height = Math.round(c.height * (1 - 2 * margin));
    flattened
      .getContext("2d")!
      .drawImage(c, -c.width * margin, -c.height * margin);
    const blob = await new Promise<Blob>((resolve, reject) =>
      flattened.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Page encoding failed."))),
        "image/png",
      ),
    );
    const png = await output.embedPng(await blob.arrayBuffer()),
      page = output.addPage([flattened.width / 1.5, flattened.height / 1.5]);
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: page.getWidth(),
      height: page.getHeight(),
    });
  }
  output.setTitle(doc.title);
  output.setCreator("Engraver");
  const bytes = await output.save();
  download(
    `${doc.title}-annotated.pdf`,
    new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
  );
}
