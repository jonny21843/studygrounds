# Explore UX improvements — DEV QA

This frontend-only batch improves discoverability and return navigation. No backend, IAM, DynamoDB, or deployment workflow changes.

## Removable filter chips
- [ ] Search for a keyword, then remove only the Search chip; subject/topic/sort should remain
- [ ] Set subject, topic, Trending sort; remove only Topic and check subject/sort are preserved
- [ ] Remove Subject with a selected Topic; topic remains only if valid under All subjects
- [ ] Remove the Sort chip; Newest becomes selected and the discovery shortcuts update
- [ ] Remove an active chip when it is the only filter; summary returns to Showing all subjects and topics
- [ ] A search containing markup or quotes displays escaped text in the removable chip
- [ ] Chip controls work by keyboard, have distinct accessible labels, and do not contain nested buttons

## Note-card discovery
- [ ] Click subject chip on an Explore note card; Explore filters to that subject
- [ ] Click topic on an Explore card; subject and topic are selected
- [ ] A note without a subject displays General as a noninteractive label
- [ ] Clicking author link continues to show the correct public contributor profile
- [ ] Clicking the note title or blank card area still opens the correct public note
- [ ] Clicking a subject or topic does not also open the note

## Return to results
- [ ] Scroll down Explore results and open a note; Back to Explore restores the previous scroll position
- [ ] The prior search, subject/topic, sort and page selection are retained when returning
- [ ] Open an author profile from Explore; Back to Explore returns to the previous position
- [ ] Directly open a shared public note or contributor profile; Back to Explore still functions without prior scroll position
- [ ] Navigate from a note into a different subject; return-to-results should not restore an obsolete scroll position
- [ ] Changing filters / Clear filters starts a fresh result set, not an old note's scroll position
- [ ] Test pagination and slow API requests; old results must not overwrite newer filters

## Regression
- [ ] Trending, Most Helpful, Most Viewed, Newest, Oldest and Title A–Z still work
- [ ] Helpful votes, Save Notes, Reporting, source previews and author pages still work
- [ ] Test signed-out Explore, 320px / 390px mobile width, 200% zoom and keyboard-only usage

## Verification
JavaScript parsing and static review passed before push. Manual browser regression testing is required on DEV. Production remains unchanged until explicitly authorized.
