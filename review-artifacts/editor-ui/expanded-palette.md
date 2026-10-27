# Expanded notation palette

Added working compact symbol controls for accidental spelling, separate rest values, double/triple dots, custom tuplets, tenuto/marcato, grace notes, ghost/dead notes, slurs, hammer/pull links, slide links and directions, bend presets, vibrato, harmonic presets, tap/slap/pop, trills/turns/mordents, tremolo, picking/arpeggios, left/right fingering, repeat bars, and alternate endings. Existing advanced notation and engraving details are available in the right inspector.

Accidental controls choose enharmonic spelling and do not change pitch; their tooltips say so. Select two notes for explicit slur/H-P/slide endpoints, or one note to connect to the next matching note. Link operations validate track, staff, voice, and guitar string. Repeat/ending edits update the global master bar across instruments.

Renderer compatibility fixes: preserve explicit dead-note source flags, use accentuation value 3 for tenuto and 2 for marcato, and use the current tremolo-picking structure. Custom dot counts and tuplets are editable in the model and retained by reconstruction.

Validation: 47 tests pass; TypeScript and scoped ESLint pass. Tests cover native values and toggle-off behavior, all palette commands rebuilding, reciprocal links and removal, rest/rhythm conversion, repeat edits from another instrument, one-step undo/redo, and invalid-link rollback.

Browser checks: applied a whole-step bend and saw the bend notation; applied 5:4 and saw its bracket; applied extra dots and undid the changes. The original Schumann score was not changed during these checks; the local Editing workflow test score was used.
