"use client";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  Drum,
  FileMusic,
  Guitar,
  ListPlus,
  Piano,
  Plus,
  Search,
  Star,
  Upload,
} from "lucide-react";
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
import "./music-library.css";
export type LibraryItem = ScoreAST | LibraryDocument;
export type ScoreTemplate = "guitar" | "piano" | "lead";
export function Library({
  items,
  setlists,
  open,
  refresh,
  downloadOriginal,
  busy,
  onNewScore,
  onImport,
}: {
  items: LibraryItem[];
  setlists: Setlist[];
  open: (item: LibraryItem) => void;
  refresh: () => void;
  downloadOriginal: (item: LibraryDocument) => void;
  busy: boolean;
  onNewScore: (template: ScoreTemplate) => void;
  onImport: () => void;
}) {
  const [template, setTemplate] = useState<ScoreTemplate>("guitar");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("recent"),
    [list, setList] = useState(""),
    [error, setError] = useState("");
  const current = setlists.find((s) => s.id === list);
  const collectionName =
    current?.name ??
    (filter === "favorites"
      ? "Favorites"
      : filter === "trash"
        ? "Trash"
        : "My music");
  const filtering = Boolean(query || filter !== "all" || current);
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
    <section className="music-library" aria-labelledby="library-title">
      <div className="music-library-heading">
        <div>
          <h1 id="library-title">Library</h1>
          <p>Your scores, documents, and setlists.</p>
        </div>
        <div
          className="music-library-create"
          role="group"
          aria-label="Add music"
        >
          <button type="button" disabled={busy} onClick={onImport}>
            <Upload size={15} aria-hidden="true" />
            Import music
          </button>
          <div className="library-new-score">
            <select
              aria-label="New score template"
              value={template}
              onChange={(event) =>
                setTemplate(event.target.value as ScoreTemplate)
              }
            >
              <option value="guitar">Guitar + tab</option>
              <option value="piano">Piano</option>
              <option value="lead">Lead sheet</option>
            </select>
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => onNewScore(template)}
            >
              <Plus size={16} aria-hidden="true" />
              New score
            </button>
          </div>
        </div>
      </div>
      <div
        className="library-filter-bar"
        role="group"
        aria-label="Library filters"
      >
        <div className="library-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search library"
            placeholder="Search title, artist, tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
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
          type="button"
          onClick={async () => {
            const name = await askText("Setlist name");
            if (name) {
              const id = crypto.randomUUID();
              void saveList({ id, name, items: [] });
              setList(id);
            }
          }}
        >
          <ListPlus size={17} aria-hidden="true" />
          New setlist
        </button>
      </div>
      <section
        className="library-collection"
        aria-labelledby="library-collection-title"
      >
        <div className="library-collection-heading">
          <div>
            <h2 id="library-collection-title">{collectionName}</h2>
            <span role="status">
              {visible.length} {visible.length === 1 ? "item" : "items"}
            </span>
          </div>
          {current && (
            <div
              className="library-setlist-actions"
              role="group"
              aria-label="Manage setlist"
            >
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
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!visible.length && (
          <div className="library-empty">
            <div className="library-empty-icon">
              {filtering ? (
                <Search size={21} aria-hidden="true" />
              ) : (
                <FileMusic size={22} aria-hidden="true" />
              )}
            </div>
            <div className="library-empty-copy">
              <h3>
                {filtering ? "No matching music" : "Your library is empty"}
              </h3>
              <p>
                {filtering
                  ? "Try another search or filter."
                  : "Create a score, import a file, or start with an example below."}
              </p>
            </div>
            {!filtering && (
              <svg
                className="library-empty-staff"
                viewBox="0 0 370 120"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M0 30h370M0 45h370M0 60h370M0 75h370M0 90h370M118 30v60m150-60v60m83-60v60"
                  stroke="currentColor"
                />
                <path
                  d="M160 74V35m32 31V27m35 47V35m83 23V19M160 35l32-8"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <g fill="currentColor">
                  <ellipse
                    cx="154"
                    cy="75"
                    rx="8"
                    ry="5.5"
                    transform="rotate(-20 154 75)"
                  />
                  <ellipse
                    cx="186"
                    cy="67"
                    rx="8"
                    ry="5.5"
                    transform="rotate(-20 186 67)"
                  />
                  <ellipse
                    cx="221"
                    cy="75"
                    rx="8"
                    ry="5.5"
                    transform="rotate(-20 221 75)"
                  />
                  <ellipse
                    cx="304"
                    cy="59"
                    rx="8"
                    ry="5.5"
                    transform="rotate(-20 304 59)"
                  />
                </g>
              </svg>
            )}
          </div>
        )}
        {!!visible.length && (
          <div className="music-library-grid">
            {visible.map((item, index) => (
              <article
                key={item.id}
                className="music-library-card"
                draggable={!!current}
                onDragStart={(e) =>
                  e.dataTransfer.setData("text/plain", item.id)
                }
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
                  className="library-item-open"
                  onClick={() => open(item)}
                  aria-label={`Open ${item.title}`}
                >
                  <span className="library-score-preview">
                    <span className="library-preview-format">
                      {"kind" in item
                        ? item.kind === "pdf"
                          ? "PDF"
                          : "IMAGE"
                        : "SCORE"}
                    </span>
                    <LibraryThumbnail item={item} />
                  </span>
                  <span className="library-item-text">
                    <strong>{item.title}</strong>
                    <span>
                      {"kind" in item
                        ? item.filename
                        : `${item.tracks.length} ${item.tracks.length === 1 ? "instrument" : "instruments"} · ${item.artist || "Unknown composer"}`}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="library-favorite"
                  aria-label="Favorite"
                  aria-pressed={!!item.favorite}
                  title={
                    item.favorite ? "Remove from favorites" : "Add to favorites"
                  }
                  onClick={() =>
                    void run(() =>
                      updateLibraryItem({
                        ...item,
                        favorite: !item.favorite,
                      }),
                    )
                  }
                >
                  <Star size={16} aria-hidden="true" />
                </button>
                <details className="library-item-details">
                  <summary>
                    Details <ChevronDown size={15} aria-hidden="true" />
                  </summary>
                  <div className="library-item-fields">
                    <label>
                      Title{" "}
                      <input
                        defaultValue={item.title}
                        onBlur={(e) =>
                          void run(() =>
                            updateLibraryItem({
                              ...item,
                              title: e.target.value,
                            }),
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
                        onClick={() =>
                          void run(() =>
                            updateLibraryItem({
                              ...item,
                              deletedAt: item.deletedAt
                                ? undefined
                                : Date.now(),
                            }),
                          )
                        }
                      >
                        {item.deletedAt ? "Restore" : "Move to trash"}
                      </button>
                      {"kind" in item && (
                        <button onClick={() => downloadOriginal(item)}>
                          Original
                        </button>
                      )}
                      <select
                        aria-label={`Add ${item.title} to setlist`}
                        value=""
                        onChange={(e) => {
                          const target = setlists.find(
                            (s) => s.id === e.target.value,
                          );
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
                    </div>
                  </div>
                </details>
                {current && (
                  <div className="toolbar wrap library-item-order">
                    <button
                      aria-label="Move up in setlist"
                      disabled={index === 0}
                      onClick={() => move(item.id, -1)}
                    >
                      <ArrowUp size={15} aria-hidden="true" />
                    </button>
                    <button
                      aria-label="Move down in setlist"
                      disabled={index === visible.length - 1}
                      onClick={() => move(item.id, 1)}
                    >
                      <ArrowDown size={15} aria-hidden="true" />
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
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {filter === "all" && !current && !query && (
        <section
          className="library-examples"
          aria-labelledby="library-examples-title"
        >
          <div className="library-examples-heading">
            <h2 id="library-examples-title">Example scores</h2>
            <p>Open an editable copy in a new tab.</p>
          </div>
          <div className="library-examples-grid">
            {examples.map((example) => {
              const type =
                example.id === "drums"
                  ? "drums"
                  : example.id === "greensleeves"
                    ? "guitar"
                    : "piano";
              const Instrument =
                type === "drums" ? Drum : type === "guitar" ? Guitar : Piano;
              return (
                <a
                  key={example.id}
                  data-instrument={type}
                  href={`/?example=${example.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${example.title} in a new tab`}
                >
                  <span className="library-example-icon">
                    <Instrument size={20} aria-hidden="true" />
                  </span>
                  <span className="library-example-copy">
                    <strong>{example.title}</strong>
                    <span>{example.instrument}</span>
                    <small>{example.description}</small>
                  </span>
                  <ArrowUpRight
                    className="library-example-arrow"
                    size={16}
                    aria-hidden="true"
                  />
                </a>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}
