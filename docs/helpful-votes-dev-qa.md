# Helpful votes and Most Helpful Explore — DEV QA

## Design and safety
- One helpful vote per authenticated account per public note; users may undo their own vote.
- Authors cannot vote on their own notes (enforced by the API).
- Votes + numeric counts change in a DynamoDB transaction to prevent duplicate/negative counts during races.
- Voting does not reveal who voted. The public APIs expose the aggregate `helpfulCount` only.
- Public notes continue to default to **Newest**. **Most helpful** ranks *all matching public notes* by descending count before pagination, breaking ties by newer publication date. Existing Most viewed remains.
- Public listing excludes private notes and notes without safe source files; readers cannot vote on moderation-held/unsafe notes.
- Votes persist on notes that are unpublished; the count will be visible again upon republishing. The API does not allow voting while unpublished.

## Manual test checklist
- [ ] Confirm DEV backend deployed HelpfulVotesTable and new authenticated API route before testing frontend
- [ ] Sign in with a non-author account; open another contributor's note and click **♡ Helpful**
- [ ] Helpful count increases by one and button changes to **♥ Marked helpful**
- [ ] Refresh and verify vote state and count persist
- [ ] Click again to undo; count decreases by one
- [ ] Repeat clicks rapidly; no duplicate votes or inflated count
- [ ] Open your own published note; self-voting is rejected and the button shows **Your note**
- [ ] Signed-out user sees count and a **Sign in to vote** action
- [ ] Explore sort dropdown includes **Most helpful**; note with more votes appears first
- [ ] With equal counts, newer published note ranks ahead; sorting applied before pagination
- [ ] Explore filters, Most viewed, Newest and Title A–Z still work normally
- [ ] Helpful totals appear on Explore cards, contributor pages, related cards, saved notes and note detail
- [ ] Open a private, moderated or unsafe note: API must reject voting and not expose content
- [ ] Sign out, switch accounts and verify each account has its own vote state
- [ ] Test 320px mobile width, keyboard access, focus and zoom

## Verification
Run unit tests: `python -m unittest discover -s tests -p 'test_helpful_votes.py'`.
Automated checks do not replace live DEV tests. Changes must remain off main until production release approval.
