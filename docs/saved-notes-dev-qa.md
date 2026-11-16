# Saved Notes — DEV QA

## Scope
Authenticated bookmarks for published notes without copying original files.
Backend: `GET /api/saved-notes` (paginated), `GET/PUT/DELETE /api/saved-notes/{noteId}`.
Uses a new `SavedNotesTable` and a `SavedAtIndex`; no mutation of the Notes table.

## Manual browser QA

- [ ] Sign in, open Explore, open a public note, click **☆ Save Note**
- [ ] Button changes to **✓ Saved — remove**; refresh and verify it remains saved
- [ ] Open **Saved Notes** tab; note appears with title, subject, author and link
- [ ] Click a saved note; original public note opens in Explore
- [ ] Remove from detail and from the Saved Notes tab; reload to confirm persistence
- [ ] Save the same note twice via repeated requests; only one bookmark exists
- [ ] Use a second account: its Saved Notes starts independently and cannot read/remove the first account's bookmarks
- [ ] Sign out: Saved Notes tab disappears and any previously loaded personal library is hidden
- [ ] Signed-out note detail shows **Sign in to save**; public browsing still works
- [ ] Unpublish a saved note: library shows **Saved note unavailable** without title or content, with Remove option
- [ ] Restore a moderated note but leave it private: still unavailable; republish to make it visible again
- [ ] A note with a blocked malware scan cannot be saved or viewed in the Saved Notes library
- [ ] Rapidly move between tabs while Saved Notes loads; no stale account data after signing out
- [ ] Narrow mobile viewport and keyboard access to saved controls
- [ ] Check the full count and **Load more** control with 21+ saves

## Verification notes
- JavaScript syntax and file review can pass without proving AWS deployed successfully.
- Unit tests: `python -m unittest discover -s tests -p 'test_saved_notes.py'`.
- Observe DEV backend stack creation for the SavedNotesTable and new authenticated routes.
- Production (`main`) must remain untouched until release approval.

## V1 tradeoffs
- Saved entries whose original notes go private remain private references, with anonymous unavailable placeholders; they can be removed.
- GSI results can be eventually consistent immediately after saving; reopening the library refreshes the listing.
- Saved Notes tab is private; share links always point to the original public note, not a bookmark.
