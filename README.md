# Engraver

A local music library, notation editor, practice workspace, and performance reader built with Next.js, React, Zustand, alphaTab, and PDF.js.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. No account, API key, or cloud service is required. PDF workers, character maps, fonts, and WebAssembly assets are copied from the installed PDF.js package by `predev` and `prebuild`.

```sh
npm run typecheck
npm test
npm run build
npm start
```

## Workspaces

- **Library:** local scores and documents, metadata, tags/collections, favorites, recoverable trash, search, sort, ordered setlists, import, and whole-library backup/restore.
- **Compose:** staff/tab rendering, multiple instruments/staves/voices, touch note entry, fretboard and piano controls, duration/rest/tuplet/tie editing, lyrics/chords/dynamics, techniques, key/clef/meter changes, repeats/navigation, measure editing/copy/paste/transposition, and engraving controls.
- **Practice:** multitrack playback, mute/solo/volume/pan, playback speed, A–B loops, metronome/count-in, cursor following, and optional local backing audio.
- **Perform:** full-screen viewing, score bookmarks and keyboard page scrolling; PDF/image reading with per-page annotation layers, undo/redo, bookmarks, crop/rotation, page ordering, annotated multipage PDF export, and PDF single/spread/continuous views.

The application supports responsive phone/tablet layouts, collapsible editing tools, resizable desktop tools, light/dark/system themes, independent score paper appearance, and saved preferences.

## Files and storage

Editable imports: Guitar Pro (`.gp`, `.gpx`, `.gp3`, `.gp4`, `.gp5`), MusicXML (`.xml`, `.musicxml`, `.mxl`), MIDI (`.mid`, `.midi`), and Engraver JSON projects. Read-only page documents: PDF, PNG, JPEG, and WebP.

Exports: Engraver JSON, Guitar Pro, common MusicXML notation, MIDI, print/save-to-PDF, original imports, and complete library backups. The backup includes scores, original files, documents, annotations, setlists, audio attachments, and recovery snapshots. Restoring merges new IDs and preserves existing local items.

Scores and binary files are stored in **IndexedDB**; small application preferences and the last-opened item use **localStorage**. Autosave takes a snapshot before asynchronous work, serializes writes, keeps up to 20 earlier score versions, and reports save errors. Cross-tab changes notify readers and pause editing of the affected open item.

The production service worker caches visited app assets for offline use. Open the production app and its viewers once online before relying on offline access. Installation, persistent storage, fullscreen, and screen wake lock depend on browser support. Library backups are portable across browsers/devices; browser storage itself is specific to the origin and browser profile.

## Verification and remaining work

See [design.md](design.md) for architecture, coverage, and limitations. Automated tests cover musical conversion/round trips, MIDI sustains, XML escaping/reimport, internal identifier regeneration, transposition conversion, ordered Immer-safe autosave, undo/redo persistence, bounded recovery snapshots, document bytes/annotations/trash, validation, and non-overwriting backup restore.
