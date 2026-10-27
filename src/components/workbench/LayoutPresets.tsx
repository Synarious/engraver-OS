"use client";
import { useEffect, useState } from "react";
import { askText } from "../../utils/dialog";
type Layout = {
  theme: string;
  paper: string;
  workspace: string;
  tools: boolean;
  zoom: number;
  layout: string;
  allTracks: boolean;
};
export function LayoutPresets<T extends Layout>({
  current,
  apply,
}: {
  current: T;
  apply: (preset: Partial<T>) => void;
}) {
  const [presets, setPresets] = useState<Record<string, Partial<T>>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        setPresets(
          JSON.parse(localStorage.getItem("engraver-layout-presets") ?? "{}"),
        );
      } catch (e) {
        setError(String(e));
      }
    });
  }, []);
  return (
    <div className="toolbar wrap">
      <select
        aria-label="Saved layout presets"
        value=""
        onChange={(e) => {
          if (presets[e.target.value]) apply(presets[e.target.value]);
        }}
      >
        <option value="">Layout presets…</option>
        {Object.keys(presets).map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
      <button
        onClick={async () => {
          const name = await askText("Layout preset name");
          if (!name) return;
          try {
            const { theme, paper, workspace, tools, zoom, layout, allTracks } =
                current,
              next = {
                ...presets,
                [name]: {
                  theme,
                  paper,
                  workspace,
                  tools,
                  zoom,
                  layout,
                  allTracks,
                } as Partial<T>,
              };
            localStorage.setItem(
              "engraver-layout-presets",
              JSON.stringify(next),
            );
            setPresets(next);
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        Save current layout
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
