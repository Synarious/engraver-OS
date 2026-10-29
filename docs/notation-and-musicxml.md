# Notation and file interchange

Engraver uses its editable score model with alphaTab for rendering and synthesized playback. MusicXML is generated from the current score and resolved native notation, rather than copying an unedited original file.

## MusicXML correctness

The exporter now writes valid tempo directions, authored key signatures, imported clefs (including tenor), transposition, enharmonic spelling, separate percussion instruments, grace notes, tempo maps, sustain pedal events, hairpins, slurs, ties, slides, hammer/pull connections, ornaments, tremolo, harmonics, chord symbols/frames, repeat endings and navigation, volume and pan. Melodic channels use all 15 available channels around percussion channel 10; larger exports assign additional MIDI ports.

Voice identifiers are normalized per staff on import, including named identifiers. Empty importer padding does not create new exported voices. Repeated MusicXML/MXL round trips keep voice counts stable. Explicit note relationships use application identities and remain valid across staff traversal order.

Both partwise and timewise files pass through the same metadata reader. MXL uses the standard container rootfile; exports are available as plain `.musicxml` or compressed `.mxl`. UTF-8, BOM-marked UTF-16 and supported declared legacy encodings are decoded before import. Missing or oversized compressed roots produce clear errors.

## What transfers

| Feature | Interchange behavior | Screen / audio behavior |
| --- | --- | --- |
| Pitches, keys, clefs, transposition | Current values and unchanged source spelling are exported | Uses the current renderer and instrument programs |
| Voices, chords, staves, rests, ties | Stable voice mapping, staff assignments and reciprocal connections | Multiple voices and staves remain editable |
| Tempo, pedal, repeats, navigation, swing | Standard events and offsets, with repeat-ending bitsets | Supported semantics drive synthesized playback |
| Note dynamics and attacks | Printed dynamics plus explicit per-note attacks | Eight velocity levels; instrument timbre comes from the soundfont |
| Slurs, bends, slides, ornaments and guitar effects | Standard symbols and connections; unsupported technique variants use descriptive technical text | Detailed curve timing or instrument-specific sound can differ |
| Chord symbols and frames | Roots, kinds, slash basses and fingering frames; unchanged source harmony retained | Chords remain editable; no automatic accompaniment is implied |
| Lyrics | Verse identity, syllables, melisma boundaries, elisions and source formatting | Lyrics are displayed, not sung |
| Layout and positions | Source page geometry, independent page starts, print metadata and note/lyric positions retained; system and font edits exported | Viewer may reflow music and places lyrics automatically |
| Microtones and cue notes | Source spelling / cue metadata retained | Microtonal playback is quantized to semitones; cue playback should be auditioned |

The score inspector supplies system/staff/lyric spacing, title/lyric font sizes, stem direction, beaming, lyric verses and line distribution, and soft/normal/forceful expression presets. The preset named forceful/harsh applies `f` and marcato. Mellow, breathy or abrasive timbre requires an appropriate instrument sound; written dynamics cannot guarantee that tone.

MusicXML positions use tenths (10 = one staff space). Positive x is right and positive y is up. Original layout metadata is retained for external engraving; the viewer uses its own layout. Full page-for-page reproduction and arbitrary drag engraving remain outside the current renderer's capabilities.

## User-facing format review

Selecting an export, choosing import files, or restoring/downloading a library backup opens a format review showing what transfers, what to review, and a recommendation. Current-score warnings include detailed bend curves, large MIDI arrangements and XML-specific lyrics exported to Guitar Pro. Imported files also report detected microtones, cue notes and specialized diagrams.

- **MusicXML / MXL:** editable notation and supported playback instructions; pages and synthesized sound may differ in other applications.
- **Guitar Pro:** supported tracks, tuning, tablature, techniques and playback. Exports target Guitar Pro 7+; XML-specific lyric positioning and detailed page geometry may simplify.
- **MIDI:** a performance interchange format. Import quantizes to sixteenths and cannot reconstruct score spelling, page layout, all controllers or expressive timing. Export sound depends on the receiving synthesizer.
- **Engraver JSON project:** complete score/editor state and source metadata, without the entire library or binary attachments.
- **PDF / images:** reading and annotation on import; no optical music recognition or note playback. Score printing exports appearance. Annotated document export flattens pages to images.
- **Imported original:** byte-for-byte original file, without later edits.
- **Library backup:** scores, originals, backing audio, documents, annotations, setlists and revisions. Restore merges previously absent IDs without overwriting existing items.

Keep a JSON project or library backup for authoritative retention. Specialized notation beyond the engine's model, detailed curves, arbitrary sound libraries, real audio and exact page rendering are not universally transferable. The application retains original imported files for reference.

## Validation and regressions

`npm run test:musicxml` requires Python with `lxml` and validates against vendored, unmodified W3C MusicXML 4.0 schemas offline. Set `MUSICXML_PYTHON` to the appropriate Python executable if needed. A bundled Codex Python is discovered automatically. Schema checks do not fetch external resources.

Tests cover basic instruments, repeated XML/MXL cycles, transposition, keys and clefs, drum sounds and mix, named voices and timewise input, tempo maps, grace notes, cross-measure pedals, navigation/endings/swing, slash chords, guitar techniques and connections, page/lyric layout metadata, independent unison attacks, and MIDI ports. Real Schumann, Saltarello and Echigo-Jishi files validate and reproduce their generated note events after export and reimport.

These checks establish the tested subset, not universal conformance for every possible MusicXML document or receiving application. The regular test suite runs semantic regressions everywhere and skips XSD-dependent cases if Python/lxml is unavailable; the dedicated command fails clearly when that dependency is missing.

## References

- [MusicXML 4.0](https://www.w3.org/2021/06/musicxml40/)
- [W3C MusicXML 4.0 schemas](https://github.com/w3c/musicxml/tree/v4.0/schema)
- [Direction structure](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/direction/)
- [Transposition](https://www.w3.org/2021/06/musicxml40/tutorial/midi-compatible-part/)
- [Percussion](https://www.w3.org/2021/06/musicxml40/tutorial/percussion/)
