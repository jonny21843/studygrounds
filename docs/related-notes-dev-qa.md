# Related public notes — DEV QA

Feature branch: `feature/related-public-notes` (target `develop`).

## Expected behavior

The public note detail page offers up to four *other* published notes from the same subject. Notes matching the current topic appear first. Results use the existing `GET /api/public/notes` endpoint, which excludes private notes and notes without a safe source file.

The section stays hidden when no recommendations exist or the supplemental request fails. The original note and its file previews must remain usable.

## Manual DEV checklist

- [ ] Open a public note whose subject has at least two public notes; related section appears and excludes the current note
- [ ] With multiple topics in the same subject, matching-topic notes are ordered before other subject notes
- [ ] Click a related note; correct note opens and URL `?note=` updates
- [ ] Navigate quickly between notes with throttled network; an older response must not overwrite the current note
- [ ] A note with no subject, or without matching published notes, has no empty related section
- [ ] Private, unpublished, moderated, and unsafe-source notes never appear
- [ ] Simulate a failed public-list request; the original detail page, report action, download, and previews remain usable
- [ ] Review keyboard tab navigation and visible focus state on related links
- [ ] Check narrow mobile widths (320–390px), tablet, and desktop for overflow
- [ ] Confirm signed-out viewing behaves the same as signed-in browsing

## Scope / limitations

- No new DynamoDB table, API endpoint, or migration
- Lightweight heuristic only: same subject, then matching topic; newest first within each tier
- Uses the first 48 newest notes from a subject; not an exhaustive relevance algorithm
- No claims of automated browser testing until tested on the deployed DEV site

## Next candidate work

Launch-readiness QA (auth/session, mobile/a11y, empty/error states), followed by backend-persisted bookmarks. Public contributor profiles require a stable author identifier; display names alone must not be used as user identity.

## Related cards design & discovery follow-up

- [ ] One recommendation uses a compact half-width card at desktop widths, not a stretched full-width card
- [ ] Two or more recommendations appear as a balanced two-column grid; one column on phones
- [ ] "Browse [subject]" filters Explore to the same subject
- [ ] Keyboard focus is visible on Browse and note-title links; long titles and descriptions wrap safely
- [ ] Related-card navigation works after opening another recommended note
