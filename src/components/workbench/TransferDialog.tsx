"use client";
import { useEffect, useRef } from "react";
import type { FormatReport } from "../../utils/formatReport";
export function TransferDialog({
  reports,
  action,
  onContinue,
  onCancel,
}: {
  reports: FormatReport[];
  action: string;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="transfer-dialog"
      aria-label="File format details"
      onCancel={onCancel}
    >
      <div className="transfer-dialog-content">
        {reports.map((report, i) => (
          <section key={i}>
            <h2>{report.title}</h2>
            <p>{report.summary}</p>
            {!!report.preserves.length && (
              <>
                <h3>What transfers</h3>
                <ul>
                  {report.preserves.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </>
            )}
            {!!report.limitations.length && (
              <>
                <h3>What to review</h3>
                <ul>
                  {report.limitations.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </>
            )}
            <p>{report.recommendation}</p>
          </section>
        ))}
      </div>
      <div className="toolbar">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          autoFocus
          className="primary"
          type="button"
          onClick={onContinue}
        >
          {action}
        </button>
      </div>
    </dialog>
  );
}
