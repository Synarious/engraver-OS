# Note editor verification

Implemented atomic score selection, note/rest hit targets, multi-select and range selection, a focused note inspector, keyboard navigation and editing, copy/paste, delete/rest, and undo/redo. The primary toolbar switches between Tab, Staff, and Combined. Non-fretted instruments retain staff notation. View changes do not change musical data.

Verified in the production browser at localhost:3000:
- Created a guitar score and inserted fret 3; clicked its tab target, changed to fret 5, and confirmed staff pitch and tab both updated with selection retained.
- Switched Tab, Staff, and Combined and visually checked actual rendered notation.
- Raised pitch with ArrowUp, undid with Ctrl+Z, extended selection with Shift+ArrowRight, changed duration, and undid.
- Checked a 390 x 844 mobile viewport, collapsed the inspector, and selected the tab note. Reduced expanded inspector height to preserve score space.

Validation: 39 tests pass; TypeScript, scoped ESLint, and production build pass. Eleven selection tests cover atomic selection, multi-selection, range navigation, undo/redo, invalid edits, independent piano staves, clipboard/delete, stable note identity, view modes, and chord hit testing.

PDF documents remain page readers; note editing applies to structured imported/composed music.
