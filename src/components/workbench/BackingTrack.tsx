"use client";
import { useEffect, useRef, useState } from "react";
import { initDatabase, announce } from "../../storage/fileSystem";
import { useEditorStore } from "../../store/editorStore";
export function BackingTrack({
  scoreId,
  speed,
}: {
  scoreId: string;
  speed: number;
}) {
  const input = useRef<HTMLInputElement>(null),
    audio = useRef<HTMLAudioElement>(null),
    [url, setUrl] = useState(""),
    [name, setName] = useState(""),
    [offset, setOffset] = useState(0),
    [linked, setLinked] = useState(false),
    [error, setError] = useState("");
  const api = useEditorStore((s) => s.alphaApi);
  useEffect(() => {
    let cancelled = false,
      url = "";
    (async () => {
      const db = await initDatabase(),
        entry = await db.get("originals", `${scoreId}:audio`);
      if (cancelled || !entry) return;
      url = URL.createObjectURL(entry.original);
      setUrl(url);
      setName(entry.filename);
      setOffset(entry.offset ?? 0);
    })().catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [scoreId]);
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed, url]);
  useEffect(() => {
    if (!api || !linked) return;
    const position = (e: any) => {
      if (audio.current) {
        const time = Math.max(0, e.currentTime / 1000 + offset);
        if (Math.abs(audio.current.currentTime - time) > 0.3)
          audio.current.currentTime = time;
      }
    };
    const state = (e: any) => {
      if (!audio.current) return;
      if (e.state === 1)
        audio.current
          .play()
          .catch((error) =>
            setError(
              `Start the audio once to allow synchronized playback: ${String(error)}`,
            ),
          );
      else audio.current.pause();
    };
    api.playerPositionChanged.on(position);
    api.playerStateChanged.on(state);
    return () => {
      api.playerPositionChanged.off(position);
      api.playerStateChanged.off(state);
    };
  }, [api, linked, offset]);
  return (
    <div className="backing-track toolbar wrap">
      <input
        ref={input}
        hidden
        type="file"
        accept="audio/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const db = await initDatabase();
            await db.put("originals", {
              id: `${scoreId}:audio`,
              filename: file.name,
              original: file,
              offset: 0,
            });
            if (url) URL.revokeObjectURL(url);
            setUrl(URL.createObjectURL(file));
            setName(file.name);
            setOffset(0);
            announce();
          } catch (e) {
            setError(String(e));
          }
        }}
      />
      <button onClick={() => input.current?.click()}>
        {name ? "Replace backing audio" : "Add local backing audio"}
      </button>
      {url && (
        <>
          <span>{name}</span>
          <audio ref={audio} src={url} controls preload="metadata" />
          <label>
            <input
              type="checkbox"
              checked={linked}
              onChange={(e) => setLinked(e.target.checked)}
            />{" "}
            Sync to score
          </label>
          <label>
            Offset (seconds)
            <input
              type="number"
              step={0.1}
              value={offset}
              onChange={async (e) => {
                const next = Number(e.target.value);
                setOffset(next);
                try {
                  const db = await initDatabase(),
                    entry = await db.get("originals", `${scoreId}:audio`);
                  if (entry)
                    await db.put("originals", { ...entry, offset: next });
                } catch (e) {
                  setError(String(e));
                }
              }}
            />
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
