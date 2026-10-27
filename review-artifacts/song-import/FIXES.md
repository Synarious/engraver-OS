# Import-review fixes and verification

All five issues from [the original real-song review](REVIEW.md) are fixed.

| Issue                                                | Repair                                                                                                                                                                                                                                                                                                                                    | Verification                                                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slurs crashed score reconstruction                   | Imported relationships are represented with stable application note IDs. Renderer IDs and reciprocal slur, tie, hammer/pull, and slide references are rebuilt together. Legacy saved projects resolve their source links without requiring reimport. Copied passages remap their internal links and drop references to omitted endpoints. | Real XML/MXL fixtures round-trip, relationship targets match the original renderer model, copied passages link to their own notes, and cut/deleted endpoints do not crash. |
| Empty beats became rests and changed pickup timing   | Empty/spacer flags and unsupported source durations survive conversion. Choosing a duration or inserting a note explicitly converts a spacer into an editable beat. Empty voices remain empty.                                                                                                                                            | All checked beat properties and measure starts match the source; Schumann's next measure starts at **240 ticks**, compared with the broken **960 ticks**.                  |
| PDF cleanup crashed navigation                       | The reader and thumbnail own and destroy PDFDocumentLoadingTask, rather than calling a nonexistent method on PDFDocumentProxy. Disposal handles pending imports/loads, is idempotent, and follows synchronous render cancellation.                                                                                                        | Unit tests cover resolved, pending, and abandoned loads. Browser PDF → Library → score transitions complete with no console errors.                                        |
| The voice selector stopped at four voices            | Choices are derived from the selected staff's imported voice slots, while retaining the normal creation choices.                                                                                                                                                                                                                          | Browser selected **voice 5** on the piano's lower staff. The corresponding source voice contains 18 notes.                                                                 |
| Error placement and enabled playback were misleading | Rendering errors appear above a collapsed score surface with a retry action. Separate loading/render-ready/player-ready states gate playback, seeking, and renderer exports. Keyboard playback follows the same gate.                                                                                                                     | A component regression verifies error placement and recovery UI; state tests verify readiness gates. Browser playback starts/stops after the real score finishes loading.  |

## Real-song result

The saved Schumann song now opens without reimporting and displays the voice plus piano grand staff. The original **27 measures, 3 staves, and all 411 notes** are retained. Slur/tie relationships, pitches, lyrics, source beat durations, empty beats, and measure timing are compared automatically against the original alphaTab import.

Both `Dichterliebe01.musicxml` and `Dichterliebe01.mxl` pass. The official Saltarello and Echigo-Jishi examples also pass reconstruction and musical-data comparisons.

The updated `model-audit.json` reports:

```json
{
  "diagnosticOnly": false,
  "changes": {},
  "examples": {}
}
```

No diagnostic bypass is needed. The previous model/timing results are retained in `before-fix/`.

## Checks

- **28 automated tests pass**, including four real-score corpus cases, graph-copy tests, legacy-project compatibility, empty/spacer timing, dynamic voices, PDF session disposal, error presentation, and playback gates.
- TypeScript check passes.
- ESLint passes for the changed application modules.
- Production build passes.
- Browser checks: restored real song, full-score rendering, fifth-voice selection, playback start/stop, PDF reader navigation, PDF thumbnail cleanup, and console-error checks.

The four corpus test cases use the downloaded files in this review directory and skip if those files are deliberately removed. The synthetic regressions remain self-contained.

## Evidence and commands

- `fixed-score.png`: repaired song in the production app.
- `model-audit.json`: current source/conversion comparisons.
- `timing-diagnostic.json`: current pickup timing.
- `before-fix/model-audit.json` and `before-fix/timing-diagnostic.json`: original failure data.
- `import-error.png` and `browser-errors.json`: screenshots/logs from the original review.

```sh
npm test
npm run typecheck
npm run build
node review-artifacts/song-import/audit.cjs
node review-artifacts/song-import/check-formats.cjs
```
