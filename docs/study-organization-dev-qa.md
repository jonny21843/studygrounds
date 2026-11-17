# Study Organization (Batch 2) — DEV QA

## Scope
- Continue Studying: remembers a signed-in reader's last chosen file within a *currently published, safe* note and offers a private library entry.
- Explicit study sessions: Start studying, Finish session; server timestamps. No automatic time tracking while casually browsing.
- Recent sessions and review history: last 30 sessions, up to 20 Continue Studying entries (scan limited to 100 progress records for V1).
- One active session per account, protected by a DynamoDB transaction (also across tabs).
- A completed session's recorded duration is capped at four hours to avoid inflated totals from abandoned tabs; a very short session may show 0 minutes.
- Personal activity is stored in StudyActivityTable with userId as the partition key. No file copies, page contents, annotations, or highlighting.
- Every note title and source availability in study history is retrieved from the *current* live public note record with strongly consistent read. Unpublished, moderated or unsafe notes return an anonymous unavailable placeholder. Study history never exposes the former private title.
- Study history is account-private. Study tools do not appear when signed out.
- This is source-file position, not precise PDF page numbers; browser PDF page tracking is not promised.

## DEV checks
- [ ] Verify DEV backend stack deployed StudyActivityTable and the authenticated /api/study routes
- [ ] Sign in and open a public note with two source files; select Source 2
- [ ] Open Study History; Continue Studying shows the note, then resumes Source 2
- [ ] Open a new public note with one source: it appears in Continue Studying without overwriting another note's position
- [ ] Rapidly switch sources; re-open and verify the last selection persists
- [ ] Start studying on a public note; in the reader Finish session appears, and a completed record appears in Study History
- [ ] Refresh during an active session; the active session can be finished afterward
- [ ] Try starting a session in two tabs or with two different notes; only one active session is allowed
- [ ] Complete session from Study History as well as from the reader
- [ ] Sign out; Study History tab disappears and previously loaded personal activity is cleared
- [ ] Sign into a different account: progress and session history must be separate
- [ ] Unpublish, moderate or malware-block a note already in history: only "Note unavailable" is shown
- [ ] Republish safe note and confirm its current title is visible again
- [ ] Check mobile layout, keyboard focus and source switching alongside Focus Mode
- [ ] Verify Explore sorting, Saved Notes, helpful voting, source previews, scan status and contributor profiles remain working

## Tests
`python -m unittest discover -s tests -p 'test_study_activity.py'`

Backend and infrastructure deploy is required. No changes to production/main unless explicitly approved.
