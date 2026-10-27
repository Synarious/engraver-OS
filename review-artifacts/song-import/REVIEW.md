# Real-song import review

> Historical review of the pre-fix behavior. All five findings have now been repaired; see [fixes and verification](FIXES.md). Rerunning the audit commands now checks the repaired implementation.

## Result

**The real song imports and is saved, but cannot be displayed.** No application code was changed during this review.

Tested the complete **Im wunderschönen Monat Mai**, from Robert Schumann's _Dichterliebe_, Op. 48. Downloaded the official MusicXML 4.0 example and its reference PDF from [MakeMusic's MusicXML example set](https://www.musicxml.com/music-in-musicxml/example-set/).

- [MusicXML source](https://wpmedia.musicxml.com/wp-content/uploads/2021/06/Dichterliebe01.musicxml)
- [Compressed MXL source](https://wpmedia.musicxml.com/wp-content/uploads/2021/06/Dichterliebe01.mxl)
- [Reference engraving PDF](https://wpmedia.musicxml.com/wp-content/uploads/2017/12/Dichterliebe01.pdf)

The original parsed score contains **27 measures, 2 parts, 3 staves, and 411 notes**. The vocal part has 62 notes. The piano's upper/lower staves contain 171/178 notes and use three/five voice slots respectively. The lower staff's fifth voice contains 18 actual notes.

## Findings, in priority order

### 1. [P1] Slur references break when renderer IDs are stripped

**Location:** `src/utils/alphaTabParser.ts:262-267`

The original file loads correctly through alphaTab, and the application AST passes project validation. `toNativeScore` then removes numeric `id` fields while retaining fields such as `sluroriginnoteid` and `slurdestinationnoteid`. Those references no longer identify their original notes. For example, a note with source ID 11 references slur destination 13, and source note 13 references origin 11. Rebuilding the graph after removing IDs throws:

```
TypeError: Cannot set properties of undefined (setting 'slurDestination')
```

The app reopens the saved song with an empty score surface and this error. The same failure occurs for the compressed MXL, and for the separate official Saltarello and Echigo-Jishi MusicXML examples.

**Recommended fix:** preserve IDs for unchanged imported graphs, or remap both IDs and every note-link reference together when duplicating/editing. Add a real slurred-score regression fixture; the current copy/paste test checks ID uniqueness without linked notes.

### 2. [P1] Empty voices become printed rests and change the pickup timing

**Locations:** `src/utils/alphaTabParser.ts:34`, `src/utils/alphaTabParser.ts:183-184`

Once the ID failure is bypassed **in the standalone diagnostic only**, conversion changes **145 beats from `isEmpty: true` to false**. It also converts **56 source duration values of 256** to quarter-note duration 4 through the fallback mapping. These include empty voice placeholders; they should not become audible/printed quarter rests.

The next measure originally begins at **240 ticks**, after the pickup. The reconstructed score begins it at **960 ticks**, shifting the subsequent 26 measure starts by **720 ticks**. In a second isolated diagnostic, restoring the original empty flags brings the next measure's start back to **240 ticks**. This confirms the timing consequence, rather than merely comparing serialized fields.

**Recommended fix:** distinguish empty spacer beats from actual rests, preserve unsupported source durations, and compare bar timing/empty voices during round-trip tests. Otherwise a slur-only repair will expose incorrect rests and pickup spacing/timing.

### 3. [P1] Leaving the PDF reader during import can crash the entire app

**Locations:** `src/components/workbench/DocumentReader.tsx:88,99`; the thumbnail reader repeats the call at `LibraryThumbnail.tsx:67`.

The browser initially had the previously imported PDF open. Importing the Schumann score unmounted that reader and produced a full-page application exception:

```
TypeError: t.destroy is not a function
```

The reader stores the result of `getDocument(...).promise`, a PDFDocumentProxy, and calls its nonexistent `destroy()` method in cleanup. In the installed PDF.js API, destruction belongs to PDFDocumentLoadingTask; PDFDocumentProxy exposes `cleanup()` instead.

Reload recovers the application shell and saved song, but then reveals finding 1. The thumbnail cleanup has the same unsupported call, although its equivalent browser transition was not separately exercised.

**Recommended fix:** retain the loading task and destroy that task during cleanup; cancel render tasks and handle asynchronous disposal safely. Add a PDF-to-editable-score navigation regression test.

### 4. [P2] The voice selector cannot select all imported voices

**Location:** `src/components/workbench/EditorTools.tsx:360`

The selector always offers indices `[0, 1, 2, 3]`. This real score's lower piano staff has an index-4 voice with **18 notes**, so that imported voice cannot be selected from the dropdown. After rendering is fixed, selecting a note on that voice would also leave the dropdown without a matching option.

**Recommended fix:** derive the options from the imported staff's voices or normalize/remap source voice numbers consistently. Preserve distinct voices and cross-staff relationships.

### 5. [P2] The display failure is easy to miss and playback appears usable

**Locations:** `src/components/workbench/ScoreCanvas.tsx:136-146`; `src/components/workbench/Workbench.tsx:888-898`.

The reader allocates a large empty white paper before placing the error message below it. At the tested desktop size the error was clipped at the bottom until scrolling. The Play button was enabled even though the score had failed to load, with transport duration `0 / 0 s`.

**Recommended fix:** show the error prominently in place of the paper, distinguish imported/saved/rendered states, and enable playback/export only when their required score/player data are ready.

## Reproduction

1. Run the current app. Start with an existing PDF open to exercise the reader cleanup.
2. Use **Import music** and select `Dichterliebe01.musicxml` in this directory.
3. Observe the application-level cleanup crash.
4. Reload. The imported song is retained and selected, but the score remains blank and reports the slur error.
5. Run the model audit below to reproduce the conversion failure independently of the browser.

```sh
node review-artifacts/song-import/audit.cjs
node review-artifacts/song-import/check-formats.cjs
npm test
```

The existing **11 tests pass**, despite the real-song failure. The review scripts are outside the normal test suite and retain the failure as evidence rather than changing production behavior.

## Evidence

- `import-blank-score.png`: the reopened song's empty paper and clipped error.
- `import-error.png`: failure after scrolling the reader.
- `browser-errors.json`: the PDF cleanup exception captured in the production browser.
- `before-fix/model-audit.json`: original failure counts and changed beat/timing fields.
- `before-fix/timing-diagnostic.json`: original pickup timing before conversion, after conversion, and with empty flags preserved.
- `imported-project.json`: the exact imported application model used by the audit.
- `reconstructed-source.json`: conversion output before the renderer throws.

The audit's ID repair and empty-flag preservation are **diagnostic copies only**, not fixes applied to the application. After temporarily restoring the source IDs for comparison, all 411 notes and the original part/staff counts survive; that does not establish correct visual engraving, because the unmodified application cannot render the song.

A complete visual comparison of note placement, slur shapes, cross-staff beams, lyrics, page breaks, and mobile layout remains blocked by the failures above. The original files and reference engraving remain beside this report for the next repair/verification pass.
