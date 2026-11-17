# Trending & Explore discovery — DEV QA

## Feature
- **Trending** is a recency-weighted ranking across all eligible public notes (and selected filters) *before* pagination.
- Score: `(1 + 5 × helpfulCount + 1.5 × ln(1 + viewCount)) × 0.5^(age in days / 21)`.
- Publication age has a 21-day half-life; helpful votes are favored over lifetime views, whose influence is logarithmic.
- This is **not** a live "views in the last 24 hours" or recent-vote ranking. The app does not store timestamps of individual views/votes.
- Newest remains the default, and Most Helpful/Most Viewed remain available.
- Discovery shortcuts appear alongside Explore results: Trending and Community favorites (Most Helpful).
- The active mode is reflected in the dropdown, button pressed state, filter summary, and an explanation visible to users.
- Private, moderated, and unsafe-file notes are excluded from all public discovery modes.

## Verify on DEV
- [ ] Enter Explore; default sort remains Newest
- [ ] Select Trending in dropdown; the Trending shortcut becomes active
- [ ] Click Trending shortcut; dropdown, filter summary, and explanation agree
- [ ] Switch to Community favorites; Most Helpful becomes active and explanation changes
- [ ] Use Clear filters; Newest returns, both shortcuts are inactive, explanation disappears
- [ ] Compare 2 similar-vote notes with different publication ages; newer should tend to rank higher
- [ ] Helpful votes influence Trending more than the same volume of low-level views
- [ ] A recently published note with a handful of votes may outrank a very old popular note
- [ ] Search / subject / topic filters still work with Trending
- [ ] 2+ pages: Trending sorts *all results* before pagination
- [ ] Older viewing, Most Helpful, Title A–Z, and Newest sorts still work
- [ ] No private, malware-blocked or moderation-held note is recommended
- [ ] Test at 320px, keyboard navigation, 200% zoom and signed-out Explore

## Tests and deployment
Run `python -m unittest discover -s tests -p 'test_helpful_votes.py'` with boto3 installed.
The code change is frontend + public-list Lambda only; no new tables or IAM changes.
One push to develop triggers one frontend and one backend deployment.
Do not promote to main without release approval.

## Future evolution
To rank genuine **recent activity**, record privacy-preserving daily/hourly view aggregates and vote timestamps, then migrate Trending from a publication-age proxy to actual recent engagement metrics.
