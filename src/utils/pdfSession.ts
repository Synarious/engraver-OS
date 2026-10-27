/** Own the loading task, not the resolved PDFDocumentProxy (PDF.js 6). */
export class PdfSession<T> {
  private task: { promise: Promise<T>; destroy: () => Promise<void> } | null =
    null;
  private disposed = false;
  private disposal: Promise<void> | null = null;

  async load(
    createTask: () => { promise: Promise<T>; destroy: () => Promise<void> },
  ) {
    if (this.disposed) return null;
    this.task = createTask();
    const document = await this.task.promise;
    return this.disposed ? null : document;
  }

  dispose() {
    this.disposed = true;
    // Defer until synchronous React cleanup has also cancelled page renders.
    return (this.disposal ??= Promise.resolve().then(async () => {
      try {
        await this.task?.destroy();
      } catch (error) {
        console.warn("PDF loading task cleanup failed", error);
      }
    }));
  }
}
