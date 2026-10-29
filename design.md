# Design and implementation status

## Authoring update

The inspector now includes system/staff/lyric spacing, title and lyric font sizes, stem direction, structured lyric syllables/melismas and line distribution, and soft/normal/forceful presets with explicit per-note attack overrides. MusicXML and MXL retain supported lyric positioning metadata, note expression, font sizes, and system arrangement. Exact lyric offsets remain interchange metadata; the current renderer positions lyrics automatically. See [notation and MusicXML evaluation](docs/notation-and-musicxml.md) for mappings, limits, and the next engraving steps. Existing staff insertion/dragging and note-range selection also supersede the older editing limitations below.

## Architecture

Engraver provides Library, Compose, Practice, and Perform workspaces over one local collection. The new entry point is `src/components/workbench/Workbench.tsx`. The older GP8 prototype components remain available in the repository but are no longer the application shell.

`ScoreAST` is the editable application model. Imported scores retain alphaTab's serialized source fields at score, track, staff, measure, voice, beat, and note levels. `toNativeScore` overlays supported edits while preserving other notation. Additional staves remain attached to their original instrument, and note string numbers are converted between renderer and application conventions. Numeric renderer identifiers are regenerated after copy/paste.

All instruments render through alphaTab. The previous non-guitar sample rendering is removed from the active interface. PDF.js renders imported page documents locally, including local fonts, CMaps, and workers. Normalized annotations remain independent of zoom and use original page identifiers when the reading order changes.

IndexedDB stores scores, original imports/audio, PDF/image documents, annotations, revisions, and setlists. localStorage stores application preferences and the last-opened item. Serialized autosave snapshots avoid revoked Immer drafts, writes run in order, and the latest 20 earlier versions remain recoverable. Library backups merge in a single transaction after validation. Cross-tab notifications use one browser channel and identify the changed item.

## Implemented coverage

- Four switchable workspaces; responsive desktop/tablet/phone layout; collapsible and resizable tools.
- Light/dark/system UI, independent light/dark/sepia score paper, saved application and per-score practice preferences.
- Local library, search, sorting, editable metadata, tags/collections, favorites, recoverable trash, ordered/drag-reordered setlists, setlist progression.
- Blank score creation, instruments, multiple staves and voices, MIDI program, tuning, track ordering/removal, part/full-score viewing.
- Actual staff/tab rendering for guitars, bass, piano, percussion, and imported instruments represented through MIDI programs.
- Click selection, touch beat selection, fretboard insertion, piano pitch insertion, pitch/fret entry, note deletion.
- Durations, dotted beats, tuplets and ratios, rests, ties, lyrics, text, chord symbols/diagrams, dynamics.
- Slur destinations, accidentals, beaming, hairpins, hammer/pull origins, ghost notes, taps/slaps/pops, vibrato, harmonics, bends, pedal markers, and existing guitar articulations.
- Measure insertion/deletion/reordering, passage copy/paste, instrument-aware passage transposition, key/clef/meter/tempo changes, repeats/endings, rehearsal/navigation marks.
- Page width/padding, bars per system, explicit system measure counts, measure spacing, display transposition, notation/tab profiles, score bookmarks, part printing.
- Guitar Pro/MusicXML/MXL/MIDI/project imports and PDF/image reading; mobile-friendly file input and download fallbacks; original imports retained.
- Project, Guitar Pro, common MusicXML, MIDI, print/save-to-PDF, original-file, and whole-library backup exports.
- Playback, seek, speed, A–B loops, metronome, count-in, following cursor, mute/solo/volume/pan, local synchronized backing audio with offset.
- PDF/image annotations, layers and layer visibility, undo/redo, pen/highlighter/text/eraser, bookmarks, crop, rotation, page reordering; PDF single/spread/continuous modes with lazy companion pages.
- Fullscreen, screen wake lock, keyboard/pedal page navigation, configurable PDF touch zones, install manifest, production offline caching.
- Save status and errors, last-item restore, versioned project validation, database upgrade from the original prototype, storage estimates/persistence request, recovery snapshots, backup/restore, cross-tab conflict handling.

## Partial features and outstanding work

This is a substantial implementation, not full feature parity with mature desktop notation applications.

1. **Optical music recognition is not implemented.** Scanned PDFs/images are readable and annotatable, but do not become editable notes. Adding recognition requires a separately selected local OMR engine/model and correction workflow.
2. **MIDI import quantizes to sixteenths.** It retains channels/programs, tied sustains, tempo and meter metadata, but is not a sophisticated performance-to-notation transcription system. Velocity curves, controller interpretation, arbitrary timing, and expressive performance reconstruction need further work.
3. **Interchange uses a tested subset of MusicXML.** MusicXML/MXL now preserve supported notation and performance events, source layout metadata and spelling, stable voices, and standard guitar/orchestral symbols. Official schema validation and real-score generated-note comparisons cover the implemented paths. Specialized diagrams, detailed curve timing, microtonal audio and exact viewer pagination remain engine limits. Format reviews explain these differences before import/export. See `docs/notation-and-musicxml.md`.
4. **Professional engraving remains partial.** Basic page/system/measure controls and parts are present; automatic part extraction workflows, collision correction, drag engraving, independent page breaks, house styles, and comprehensive orchestral/transposing-instrument workflows need development.
5. **Selection/editing is measure/beat based.** There is no rectangular score marquee, drag-to-change-pitch staff gesture, arbitrary note-range clipboard, or complete keyboard command system. Common note entry is available through explicit touch controls.
6. **Performance controls need device testing.** Keyboard-style Bluetooth pedals are supported through standard navigation keys; vendor-specific pedal protocols, stylus pressure/palm rejection, and real-device audio latency have not been validated. PDF view modes do not yet provide paginated two-page engraved-score mode.
7. **Document export is rasterized.** Full annotated multipage PDF export is implemented, including page order, crop, rotation, and all layers. It flattens page images rather than retaining searchable/vector source PDF content. Annotation rotation transforms points; editable text orientation across rotations still needs refinement.
8. **Layout customization is basic.** Workspace switching, named layout presets, tool resizing/collapse with saved panel width, paper appearance, and saved preferences exist. Drag-docked panels and user theme palettes are not implemented.
9. **Offline/device coverage is incomplete.** The service worker is production-only and caches assets as used. Full offline installation/update tests, Safari/iOS/Android checks, low-storage stress tests, import-version fixtures, and concurrent-writer race tests remain. Cross-tab notification pauses are protective, but do not provide a distributed lock.
10. **Library polish remains.** PDF/image covers preview original pages; score covers show a simplified preview of the first notes. Search is metadata based, and collections are tags rather than a nested folder hierarchy. Setlist items can be reordered and advanced, but richer per-setlist performance variants are not implemented.

## Verified in this change

- TypeScript check and production build.
- Automated conversion, round-trip, MIDI, validation, persistence, recovery, and backup tests.
- Real-score XML/MXL regressions preserve note links, empty voices, pitches, lyrics, durations, and pickup timing; legacy saved scores work without reimport.
- Browser verification of Schumann full-score rendering, fifth-voice selection, playback, and PDF-to-score navigation.
- Loading-task PDF disposal and prominent render errors with playback readiness gates.
- Browser creation/rendering of a score, touch insertion, and saved-score restoration.
- Local import/rendering/navigation of a synthetic two-page PDF.
- Text annotation saved and visible after page reload.
- Phone layout checked at 390 × 844.
- Flattened annotated PDF export downloaded and validated to contain both source pages.

Physical mobile devices, pedal hardware, audio output quality, production offline updates, and the complete import-format/version matrix are not yet verified.
