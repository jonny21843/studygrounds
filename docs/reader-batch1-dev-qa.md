# Batch 1 — StudyGrounds document reader DEV QA

## Architecture and behavior
- One source file is mounted at a time, with a source selector and Previous / Next file buttons. This reduces simultaneous Office preview work.
- Source previews still use the existing browser PDF/image viewer and the existing native Excel, Word, PowerPoint and Pages preview APIs. No custom document editor is introduced.
- PDF page navigation/zoom remains in the browser's native PDF controls; an **Open in Browser** link remains available.
- PowerPoint preview includes **Jump to slide** for extracted slides. It does not represent rendered PPTX slide fidelity.
- Focus mode expands the public note panel into a large reading overlay. Escape and **Exit focus** close it.
- Text size adjusts extracted document/slide preview text, not PDF content inside the native browser iframe, not uploaded originals.
- Wide/Comfortable width and text size are browser-local preferences via localStorage. They are not synchronized to accounts or shared with authors.
- No persisted reading progress, private annotations, highlights, or session tracking ships in this batch. Those remain planned for subsequent batches.

## Manual DEV testing
- [ ] Open a public note with **one** PDF; preview loads, browser page controls and Open in Browser work; no source switching required
- [ ] Open a note with at least **two** mixed sources (PDF + DOCX/PPTX/XLSX/Pages if available); verify source picker and Previous / Next only display the chosen source
- [ ] Switch quickly between files while a document preview is loading; stale preview must not replace the active file
- [ ] The source number, active source button and previous/next disabled states stay synchronized
- [ ] Read-only DOCX/Pages preview, spreadsheet preview, PowerPoint text preview and original downloads still work
- [ ] PowerPoint Jump to slide moves to the correct extracted slide
- [ ] Enter Focus mode, scroll and switch sources, Exit focus and confirm ordinary page returns; Escape also exits
- [ ] Navigate to a contributor, another subject, Saved Notes or another public note from focus mode; full-screen layout is cleaned up
- [ ] Set Text size Large or Extra large; verify extracted preview text grows (not the PDF iframe)
- [ ] Set Comfortable reading width; verify content width narrows; reload to confirm local browser preference persists
- [ ] Test with browser localStorage disabled; reader still works at default settings
- [ ] Test at 320px / 390px widths and 200% browser zoom: no horizontal page overflow; file controls are touch-friendly
- [ ] Keyboard-only Tab / Enter / Escape; source picker pressed state and focus indicators work
- [ ] Regression: Explore filtering, contributor profiles, related notes, Saved Notes, Helpful votes, report forms, public share links

## Security and release
- This batch edits only frontend JS/CSS and a QA document; no backend migration or IAM change.
- Browser-side read-only preferences are not account records.
- A successful syntax check does not constitute browser-based QA. Do not promote to main without explicit approval.
