# Engraver workflow review

The review covered the path from Library to Compose or Perform, then back to a saved score or an exported file. The workbench now keeps common commands visible and makes room for the music based on both the width and height of the window.

| Situation | What the review found | What changed |
| --- | --- | --- |
| Starting or reopening work | On a phone, New and Import were behind Actions. The example list could push saved music several screens down. | Import and New are beside the Library title. Saved music comes first, with backup and restore in one Library disclosure. |
| Editing a score | The narrow notation rail consumed the same width whether or not it was needed, and score settings were buried inside View. | Compose gives the score the full width on phones, tablets, and short windows. Palette, Note details, and Score settings open one panel at a time. Wide, tall windows retain the side-by-side editor. |
| Reading while practicing | Playback controls competed for space at narrow widths. Display changes rebuilt MIDI, and page shortcuts did not scroll across a horizontal score. | Play, seek, speed, Follow, and loop commands stay in the dock. Performance tools are in one disclosure. Zoom and page/horizontal layout redraw the existing score while playback continues; page shortcuts follow the layout. |
| Reading and marking PDFs | A fixed-size canvas blurred at high pixel density and zoom. Spread zoom did not resize the pages, and starting a touch near an edge could turn the page before a swipe. | Page and zoom controls stay visible. Active and visible companion canvases use measured width and device pixel density, with a size cap. A page turn requires a completed tap. Visible layers apply to both pages. |
| Checking an edited score | An overfull voice or conflicting tab position could be hard to find after a duration or import change. | **Check score** checks these cases locally and takes the editor to the affected beat or note. It does not alter the score. |

The control layout was checked at 320 × 568 and 390 × 844 phone sizes, 667 × 375 and 844 × 390 landscape sizes, 768 × 1024 and 1024 × 768 tablet sizes, 1366 × 768 desktop, and 2560 × 1080 ultrawide. Coverage varied by workspace. Chrome touch emulation reached 3× pixel density; at 390 CSS pixels, the PDF page used a 382 CSS pixel surface backed by 1,146 pixels before zoom. At short landscape heights, Compose removes the dense track overview so the staff has more room; measures and instruments are still available in Score settings.

Verification exercised score creation, note entry, undo/redo, format review, MusicXML download, score check navigation, keyboard disclosure focus, playback speed and seek, repeating an A–B passage, PDF touch gestures, annotation persistence, PDF spread and continuous views, and multipage annotated export. The automated suite covers notation, playback, storage, and interchange using synthetic and real scores.

The control layout uses the W3C guidance on [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [pointer target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum), and [keyboard behavior for disclosures](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/) as design references.

For the next pass, prioritize:

1. Make mixer changes apply to the running player. Mute, solo, volume, and pan currently write to the score model; those writes can rebuild playback. Use the player’s mix controls while adjusting a value, then persist one change at the end of the gesture.
2. Test large orchestral and guitar scores on physical phones and tablets. The browser checks do not cover Safari, stylus or pedal hardware, sustained playback, or the memory limits of an older device. Stress test page resizing, long scores, and offline reopening before relying on the app at a performance.
3. Improve keyboard and screen reader navigation inside the score. Keyboard users can work with the current selection and jump to score check results, but a fully navigable representation of measures, voices, and notes would make it easier to explore an unfamiliar score.
