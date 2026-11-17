# DEV QA — Auto-save on private annotation/highlight

## Behavior
A successful new personal annotation or highlight now adds the public note to the same reader's Saved Notes. The backend commits the annotation Put and bookmark Update in a single DynamoDB transaction against the existing StudyActivityTable and SavedNotesTable. If the transaction fails, neither is written. The saved entry uses the same `savedAt`, `savedKey`, and `noteOwnerId` fields as ordinary bookmarks. Existing saved timestamps are retained with `if_not_exists`, so repeat annotations do not create duplicate bookmarks or move old bookmarks to the top.

The reader's Save Note control updates as soon as the backend returns success. The new behavior does not retroactively bookmark old annotations, does not auto-save merely on viewing a note, and does not remove saved notes when a reader deletes the last annotation. Users can always remove the bookmark manually. New annotations later will save it again.

This feature does not change who sees private annotations. Public note availability and malware/moderation validation still apply.

## DEV tests
- [ ] Confirm the DEV backend and frontend deployments succeeded; no new table is needed.
- [ ] Open an unsaved public PDF and write a personal note; after saving, the Save Note control becomes "Saved — remove".
- [ ] Visit Saved Notes; the annotated note appears with its normal title/subject. Refresh and verify persistence.
- [ ] Highlight text in an unsaved DOCX or PPTX; confirm highlighting succeeds and the note appears in Saved Notes.
- [ ] Add another annotation or highlight to an already-saved note; verify the Saved Notes list contains it only once.
- [ ] Existing bookmark date/order stays unchanged after repeated annotations.
- [ ] Delete an annotation/highlight: the bookmark stays.
- [ ] Manually remove the bookmark: annotations remain private and persist in the reader; adding a new annotation saves the note again.
- [ ] No automatic bookmark is created merely by opening a note or switching between sources.
- [ ] Try to save an invalid, blank, over-length, or unsupported highlight selection: neither a new annotation nor a bookmark appears.
- [ ] Unpublish or moderate a source: new annotations and bookmarking must fail; any existing bookmark must show unavailable, without leaked content.
- [ ] Sign into another account: annotations and the newly auto-saved bookmark are isolated per account.
- [ ] Check immediate Save button display while its initial status check is still in progress, plus page refresh.
- [ ] Verify Save Notes, study sessions, study history, source previews, and focus mode still work.

## Tests
Run: `python -m unittest discover -s tests -p 'test_private_annotations.py'`.

No changes to production/main until explicitly approved.
