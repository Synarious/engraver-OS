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
- **Perform:** full-screen score and document viewing, bookmarks, and keyboard page turns. Practice controls include multitrack playback, mute/solo/volume/pan, speed, A–B loops, metronome/count-in, cursor following, and local backing audio. PDFs and images support annotation layers, undo/redo, crop/rotation, page ordering, annotated PDF export, and single/spread/continuous views.

The application supports responsive phone/tablet layouts, collapsible editing tools, resizable desktop tools, light/dark/system themes, independent score paper appearance, and saved preferences.

In Compose, **Check score** flags overfull measures and tablature mismatches on your device. Choose a finding to jump to the affected beat or note.

In **View → Notation views**, enable standard staff, tablature, rhythmic slashes, or Jianpu individually or together. Tablature needs a fretted staff. Percussion uses a staff when no other compatible view is selected. These are display choices; the underlying pitches and durations stay the same.

In Compose, select a beat and open **Chords & scales**. Choose a root and chord quality to browse voicings, then add the symbol or a diagram that matches the staff tuning. The library supports 3–10 strings, custom open pitches, and fret ranges from open through fret 24. Save scale diagrams to the score's printable diagram section. For piano, select a note to mark a finger (1–5), or select eight consecutive notes of a major scale to apply a one-octave pattern for either hand. Engraver projects retain saved scale graphics; Guitar Pro and MusicXML exports do not carry those graphics.

References: [Guitar Pro notation views](https://www.guitar-pro.com/docs/gp8/display-options/notations), [Guitar Pro scale diagrams](https://www.guitar-pro.com/docs/gp8/tools/scales-diagrams), and the [Crane School of Music keyboard fingering guide](https://www.potsdam.edu/sites/default/files/KeyboardSkillsI.pdf).

## Files and storage

Editable imports: Guitar Pro (`.gp`, `.gpx`, `.gp3`, `.gp4`, `.gp5`), MusicXML (`.xml`, `.musicxml`, `.mxl`), MIDI (`.mid`, `.midi`), and Engraver JSON projects. Read-only page documents: PDF, PNG, JPEG, and WebP.

Exports: Engraver JSON, Guitar Pro, MusicXML/MXL notation, MIDI, print/save-to-PDF, original imports, and complete library backups. The backup includes scores, original files, documents, annotations, setlists, audio attachments, and recovery snapshots. Restoring merges new IDs and preserves existing local items.

Scores and binary files are stored in **IndexedDB**; small application preferences and the last-opened item use **localStorage**. Autosave takes a snapshot before asynchronous work, serializes writes, keeps up to 20 earlier score versions, and reports save errors. Cross-tab changes notify readers and pause editing of the affected open item.

The production service worker caches visited app assets for offline use. Open the production app and its viewers once online before relying on offline access. Installation, persistent storage, fullscreen, and screen wake lock depend on browser support. Library backups are portable across browsers/devices; browser storage itself is specific to the origin and browser profile.

## Verification and remaining work

See [design.md](design.md) for architecture, coverage, and limitations. Automated tests cover musical conversion/round trips, MIDI sustains, XML escaping/reimport, internal identifier regeneration, transposition conversion, ordered Immer-safe autosave, undo/redo persistence, bounded recovery snapshots, document bytes/annotations/trash, validation, and non-overwriting backup restore.

See the [workspace review](docs/workspace-review.md) for device and workflow findings, browser coverage, and priorities for further testing.

See the [score editor comparison](docs/score-editor-comparison.md) for features worth borrowing and the recommended order for adding them.

## Cloudflare Workers

OpenNext configuration is in `open-next.config.ts` and `wrangler.jsonc`. Set Workers Builds commands to:

- Build: `npm run cf:build`
- Deploy: `npm run cf:deploy`
- Preview branch upload: `npm run cf:upload`

`npm run cf:preview` serves an already-built Worker locally. OpenNext invokes the npm `build` script, which runs Next.js with telemetry disabled. The Wrangler config disables CLI usage metrics and dependency reporting. Use npm and commit `package-lock.json` when dependencies change. Workers Builds detects the package manager from the lockfile.

The sound bank is served in two byte-exact chunks, joined before playback, to fit Cloudflare's 25 MiB static asset limit. Asset preparation runs before development and production builds. `cf:build` removes the oversized source bank from deployment output and validates asset sizes.

`public/.assetsignore` also excludes the full sound bank from Wrangler and Miniflare asset manifests. OpenNext copies this file to the deployment assets directory, so direct OpenNext build/deploy commands respect the exclusion too.

File format reviews explain preservation and playback differences before import/export. See [notation and MusicXML](docs/notation-and-musicxml.md) for supported mappings, limits, and strict schema checks.
