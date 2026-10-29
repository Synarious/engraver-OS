# Engraver

A local music library, notation editor, and performance workspace built with Next.js, React, Zustand, alphaTab, and PDF.js.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000. No account, API key, or cloud service is required. PDF workers, character maps, fonts, and WebAssembly assets are copied from the installed PDF.js package by `predev` and `prebuild`.

Keep the terminal running while using the development site. Open the exact **Local** address printed by Next.js: if port 3000 is occupied it chooses another port, and that port belongs only to that running process. A “site can’t be reached” page usually means the server stopped or the browser is pointed at an old port. Restart `npm run dev` in a terminal and use its new address; do not close that terminal. An existing server on port 3000 may be a different checkout. Browser storage is separate for each port, so changing ports also changes the library visible to that browser. For a consistent library, stop the old server and restart on the same port. If the terminal says the server is ready but the browser still cannot connect, check whether the process is running in a network-restricted sandbox; start it in a normal terminal with localhost access.

```sh
npm run typecheck
npm test
npm run test:musicxml # strict schema + interchange checks (Python/lxml)
npm run build
npm start
```

## Workspaces

- **Library:** local scores and documents, metadata, tags/collections, favorites, recoverable trash, search, sort, ordered setlists, import, and whole-library backup/restore.
- **Compose:** staff/tab rendering, multiple instruments/staves/voices, touch note entry, fretboard and piano controls, duration/rest/tuplet/tie editing, lyrics/chords/dynamics, techniques, key/clef/meter changes, repeats/navigation, measure editing/copy/paste/transposition, and engraving controls.
- **Practice:** multitrack playback, mute/solo/volume/pan, playback speed, Aâ€“B loops, metronome/count-in, cursor following, and optional local backing audio.
- **Perform:** full-screen viewing, score bookmarks and keyboard page scrolling; PDF/image reading with per-page annotation layers, undo/redo, bookmarks, crop/rotation, page ordering, annotated multipage PDF export, and PDF single/spread/continuous views.

The application supports responsive phone/tablet layouts, collapsible editing tools, resizable desktop tools, light/dark/system themes, independent score paper appearance, and saved preferences.

## Files and storage

Editable imports: Guitar Pro (`.gp`, `.gpx`, `.gp3`, `.gp4`, `.gp5`), MusicXML (`.xml`, `.musicxml`, `.mxl`), MIDI (`.mid`, `.midi`), and Engraver JSON projects. Read-only page documents: PDF, PNG, JPEG, and WebP.

Exports: Engraver JSON, Guitar Pro, MusicXML/MXL notation, MIDI, print/save-to-PDF, original imports, and complete library backups. The backup includes scores, original files, documents, annotations, setlists, audio attachments, and recovery snapshots. Restoring merges new IDs and preserves existing local items.

Scores and binary files are stored in **IndexedDB**; small application preferences and the last-opened item use **localStorage**. Autosave takes a snapshot before asynchronous work, serializes writes, keeps up to 20 earlier score versions, and reports save errors. Cross-tab changes notify readers and pause editing of the affected open item.

The production service worker caches visited app assets for offline use. Open the production app and its viewers once online before relying on offline access. Installation, persistent storage, fullscreen, and screen wake lock depend on browser support. Library backups are portable across browsers/devices; browser storage itself is specific to the origin and browser profile.

## Verification and remaining work

See [design.md](design.md) for architecture, coverage, and limitations. Automated tests cover musical conversion/round trips, MIDI sustains, XML escaping/reimport, internal identifier regeneration, transposition conversion, ordered Immer-safe autosave, undo/redo persistence, bounded recovery snapshots, document bytes/annotations/trash, validation, and non-overwriting backup restore.

## Cloudflare Workers

OpenNext configuration is in `open-next.config.ts` and `wrangler.jsonc`. Set Workers Builds commands to:

- Build: `npm run cf:build`
- Deploy: `npm run cf:deploy`
- Preview branch upload: `npm run cf:upload`

`npm run cf:preview` serves an already-built Worker locally. Keep `build` as `next build`; OpenNext invokes it internally. Commit both lockfiles after changing dependencies. The package is `@opennextjs/cloudflare`; `opennextjs-cloudflare` is its executable.

The sound bank is served in two byte-exact chunks, joined before playback, to fit Cloudflare's 25 MiB static asset limit. Asset preparation runs before development and production builds. `cf:build` removes the oversized source bank from deployment output and validates asset sizes.

`public/.assetsignore` also excludes the full sound bank from Wrangler and Miniflare asset manifests. OpenNext copies this file to the deployment assets directory, so direct OpenNext build/deploy commands respect the exclusion too.

File format reviews explain preservation and playback differences before import/export. See [notation and MusicXML](docs/notation-and-musicxml.md) for supported mappings, limits, and strict schema checks.
