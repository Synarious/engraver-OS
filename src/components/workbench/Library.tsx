"use client";
import { useState } from "react";
import { askText } from "../../utils/dialog";
import { ScoreAST } from "../../types/score";
import {
  LibraryDocument,
  Setlist,
  updateLibraryItem,
  initDatabase,
  announce,
} from "../../storage/fileSystem";
import { LibraryThumbnail } from "./LibraryThumbnail";
import { examples } from "../../utils/examples";
export type LibraryItem = ScoreAST | LibraryDocument;
export function Library({
  items,
  setlists,
  open,
  refresh,
  downloadOriginal,
}: {
  items: LibraryItem[];
  setlists: Setlist[];
  open: (item: LibraryItem) => void;
  refresh: () => void;
  downloadOriginal: (item: LibraryDocument) => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("recent"),
    [list, setList] = useState(""),
    [error, setError] = useState("");
  const current = setlists.find((s) => s.id === list);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      setError("");
      await fn();
      refresh();
    } catch (e) {
      setError(String(e));
    }
  };
  const saveList = (s: Setlist) =>
    run(async () => {
      const db = await initDatabase();
      await db.put("setlists", s);
      announce();
    });
  let visible = items.filter(
    (item) =>
      (filter === "trash" ? !!item.deletedAt : !item.deletedAt) &&
      (filter !== "favorites" || item.favorite) &&
      (!current || current.items.includes(item.id)) &&
      `${item.title} ${"artist" in item ? (item.artist ?? "") : ""} ${item.tags?.join(" ") ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  visible = visible.sort((a, b) =>
    current
      ? current.items.indexOf(a.id) - current.items.indexOf(b.id)
      : sort === "title"
        ? a.title.localeCompare(b.title)
        : (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  );
  const move = (id: string, delta: number) => {
    if (!current) return;
    const ids = [...current.items],
      i = ids.indexOf(id),
      j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void saveList({ ...current, items: ids });
  };
  return (
    <section className="library">
      <div className="library-heading">
        <div>
          <p className="eyebrow">YOUR MUSIC, ON THIS DEVICE</p>
          <h1>Library</h1>
          <p>Scores, documents, and setlists stored locally.</p>
        </div>
        <strong>{items.filter((i) => !i.deletedAt).length} items</strong>
      </div>
      <div className="toolbar wrap">
        <input
          aria-label="Search library"
          placeholder="Search title, artist, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Library filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All music</option>
          <option value="favorites">Favorites</option>
          <option value="trash">Trash</option>
        </select>
        <select
          aria-label="Sort library"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Recently changed</option>
          <option value="title">Title</option>
        </select>
        <select
          aria-label="Setlist"
          value={list}
          onChange={(e) => setList(e.target.value)}
        >
          <option value="">All setlists</option>
          {setlists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={async () => {
            const name = await askText("Setlist name");
            if (name) {
              const id = crypto.randomUUID();
              void saveList({ id, name, items: [] });
              setList(id);
            }
          }}
        >
          New setlist
        </button>
        {current && (
          <>
            <button
              onClick={async () => {
                const name = await askText("Rename setlist", current.name);
                if (name) void saveList({ ...current, name });
              }}
            >
              Rename setlist
            </button>
            <button
              onClick={() =>
                void run(async () => {
                  const db = await initDatabase();
                  await db.delete("setlists", current.id);
                  setList("");
                  announce();
                })
              }
            >
              Delete setlist
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {filter !== "trash" && !current && !query && (
        <section className="example-scores" aria-label="Example scores">
          <h2>Try an example</h2>
          <p>Open an editable copy in a new tab.</p>
          <div className="example-list">
            {examples.map((example) => (
              <a
                key={example.id}
                href={`/?example=${example.id}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open ${example.title} in a new tab`}
              >
                <strong>{example.title}</strong>
                <span>{example.instrument}</span>
                <small>{example.description} ↗</small>
              </a>
            ))}
          </div>
        </section>
      )}
      {!visible.length && (
        <div className="empty-state">
          <h2>No music here yet</h2>
          <p>
            Create a score or import Guitar Pro, MusicXML, MIDI, PDF, or an
            image.
          </p>
        </div>
      )}
      <div className="library-grid">
        {visible.map((item, index) => (
          <article
            key={item.id}
            className="library-card"
            draggable={!!current}
            onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
            onDragOver={(e) => {
              if (current) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!current) return;
              const id = e.dataTransfer.getData("text/plain");
              if (!current.items.includes(id) || id === item.id) return;
              const ids = current.items.filter((i) => i !== id);
              ids.splice(ids.indexOf(item.id), 0, id);
              void saveList({ ...current, items: ids });
            }}
          >
            <button
              className="score-cover"
              onClick={() => open(item)}
              aria-label={`Open ${item.title}`}
            >
              <span>
                {"kind" in item
                  ? item.kind === "pdf"
                    ? "PDF"
                    : "IMAGE"
                  : "SCORE"}
              </span>
              <LibraryThumbnail item={item} />
              <strong>{item.title}</strong>
            </button>
            <h2>
              <button onClick={() => open(item)}>{item.title}</button>
            </h2>
            <p>
              {"kind" in item
                ? item.filename
                : `${item.tracks.length} instruments · ${item.artist || "Unknown composer"}`}
            </p>
            <label>
              Title{" "}
              <input
                defaultValue={item.title}
                onBlur={(e) =>
                  void run(() =>
                    updateLibraryItem({ ...item, title: e.target.value }),
                  )
                }
              />
            </label>
            <label>
              Tags / collections{" "}
              <input
                defaultValue={item.tags?.join(", ") ?? ""}
                onBlur={(e) =>
                  void run(() =>
                    updateLibraryItem({
                      ...item,
                      tags: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }),
                  )
                }
              />
            </label>
            <div className="toolbar wrap">
              <button
                aria-pressed={!!item.favorite}
                onClick={() =>
                  void run(() =>
                    updateLibraryItem({ ...item, favorite: !item.favorite }),
                  )
                }
              >
                {item.favorite ? "★ Favorite" : "☆ Favorite"}
              </button>
              <button
                onClick={() =>
                  void run(() =>
                    updateLibraryItem({
                      ...item,
                      deletedAt: item.deletedAt ? undefined : Date.now(),
                    }),
                  )
                }
              >
                {item.deletedAt ? "Restore" : "Move to trash"}
              </button>
              {"kind" in item && (
                <button onClick={() => downloadOriginal(item)}>Original</button>
              )}
              <select
                aria-label={`Add ${item.title} to setlist`}
                value=""
                onChange={(e) => {
                  const target = setlists.find((s) => s.id === e.target.value);
                  if (target && !target.items.includes(item.id))
                    void saveList({
                      ...target,
                      items: [...target.items, item.id],
                    });
                }}
              >
                <option value="">Add to setlist…</option>
                {setlists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {current && (
                <>
                  <button
                    disabled={index === 0}
                    onClick={() => move(item.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    disabled={index === visible.length - 1}
                    onClick={() => move(item.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() =>
                      void saveList({
                        ...current,
                        items: current.items.filter((id) => id !== item.id),
                      })
                    }
                  >
                    Remove from setlist
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
