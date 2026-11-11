"use client";

import { useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  CircleCheck,
  ClipboardCheck,
  Guitar,
  Timer,
} from "lucide-react";
import { useEditorStore } from "../../store/editorStore";
import {
  checkScore,
  type ScoreCheckJump,
  type ScoreFinding,
} from "../../utils/scoreCheck";
import { locateBeat } from "../../utils/scoreSelection";
import styles from "./ScoreCheck.module.css";

const pageSize = 8;

export function ScoreCheck({
  disabled = false,
  onJump,
}: {
  disabled?: boolean;
  onJump: (request: ScoreCheckJump) => void;
}) {
  const score = useEditorStore((state) => state.score);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [findings, setFindings] = useState<ScoreFinding[]>([]);
  const [visible, setVisible] = useState(pageSize);
  if (!score) return null;

  function jump(finding: ScoreFinding) {
    const state = useEditorStore.getState();
    if (
      !state.score ||
      state.score !== score ||
      disabled ||
      !locateBeat(state.score, finding.location)
    )
      return;
    dialog.current?.close();
    if (state.isPlaying) state.alphaApi?.pause();
    state.selectLocation(finding.location);
    onJump({ scoreId: score.id, location: finding.location });
  }

  return (
    <>
      <button
        className={styles.trigger}
        type="button"
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => {
          setFindings(checkScore(score));
          setVisible(pageSize);
          dialog.current?.showModal();
        }}
      >
        <ClipboardCheck size={17} aria-hidden="true" />
        Check score
      </button>
      <dialog
        ref={dialog}
        className={`studio-dialog ${styles.dialog}`}
        aria-labelledby={title}
      >
        <div className={styles.header}>
          <h2 id={title}>Score check</h2>
          <p>Review rhythm and tablature. This check runs on your device.</p>
        </div>
        <div className={styles.body}>
          {findings.length ? (
            <>
              <p className={styles.summary}>
                {findings.length} {findings.length === 1 ? "spot" : "spots"} to
                review
              </p>
              <ul className={styles.findings} role="list">
                {findings.slice(0, visible).map((finding) => {
                  const { kind, location } = finding;
                  const Icon = kind === "rhythm" ? Timer : Guitar;
                  return (
                    <li key={`${kind}:${location.noteId ?? location.beatId}`}>
                      <button
                        type="button"
                        className={styles.finding}
                        disabled={disabled}
                        onClick={() => jump(finding)}
                      >
                        <Icon
                          className={styles.icon}
                          size={19}
                          aria-hidden="true"
                        />
                        <span className={styles.copy}>
                          <small>
                            Measure {location.measureIndex + 1} ·{" "}
                            {finding.trackName}
                            {finding.staffCount > 1 &&
                              ` · Staff ${location.staffIndex + 1}`}
                            {kind === "rhythm" &&
                              ` · Voice ${location.voiceIndex + 1}`}
                          </small>
                          <strong>{finding.title}</strong>
                          <span>{finding.detail}</span>
                        </span>
                        <ArrowUpRight
                          size={17}
                          className={styles.arrow}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {visible < findings.length && (
                <button
                  type="button"
                  onClick={() => setVisible((count) => count + pageSize)}
                >
                  Show {Math.min(pageSize, findings.length - visible)} more
                </button>
              )}
            </>
          ) : (
            <div className={styles.clear}>
              <CircleCheck
                size={22}
                className={styles.icon}
                aria-hidden="true"
              />
              <p>No overfull measures or tablature mismatches found.</p>
            </div>
          )}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            Done
          </button>
        </div>
      </dialog>
    </>
  );
}
