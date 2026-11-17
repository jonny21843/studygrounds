# DEV QA — source scan status and PowerPoint slide selection

## Upload scan status

Issue: `uploadFileForNote` sets a transient upload message, "Uploaded. Security scan in progress…", in `notesState.uploadFeedback`. The owner card displays this message in preference to the server's real file scan status, so it can continue to display pending even when a file is marked `NO_THREATS_FOUND`. Refreshing the browser clears the in-memory feedback and makes the correct result appear.

Fix: After each successful authenticated `loadNotes()` response, discard *only* the matching transient "Uploaded/Replaced. Security scan in progress…" message once the note has no remaining PENDING files or pending publication. Preserve errors and messages for notes still pending. Do not bypass malware gating or mark scans as successful in the frontend.

Check:
- [ ] Add a second source to an existing note. Initial owner-card message may say scanning; status changes automatically after backend reports passed, without a browser refresh.
- [ ] Open Manage while the scan is pending. As the scan completes, confirm source status updates to **Security scan passed**.
- [ ] Replace a source file and confirm the scan message also clears after its final result.
- [ ] Upload a note with a blocked scan outcome. Verify a blocked status, no false "scan passed" indication and no unintended publication.
- [ ] Check that upload validation errors remain visible rather than being wiped as transient scan feedback.
- [ ] Confirm that refreshing or navigating away/back still displays actual scan results.
- [ ] Verify existing 4-second polling while scans are pending and that it stops when none remain.

## PowerPoint slide selection

Issue: old "Jump to slide" merely scrolled the selected slide into view while all slides stayed visible, misleading on a short deck.

Fix: show one extracted slide at a time, with View slide dropdown and Previous/Next slide controls. Both controls synchronize and respect first/last slide boundaries.

Check:
- [ ] Two-slide PPTX: only Slide 1 appears on load. Selecting Slide 2 hides Slide 1.
- [ ] Previous/Next navigate correctly; disabled at boundaries.
- [ ] Single-slide PPTX: both navigation buttons disabled.
- [ ] A PPTX with many slides switches without changing the selected source file.
- [ ] Switching between source files preserves one-active-source behavior and loads a fresh deck.
- [ ] Existing read-only PPTX extraction and original download remain functional.
- [ ] Test keyboard-only controls, mobile viewport, focus mode, and no unwanted page scrolling.

## Release

Only notes.js and styles.css updated, plus this QA note. No AWS/SAM/IAM edits. Check in DEV before any production release.
