# Public contributor profiles — DEV QA

Implementation on `develop`; do not promote to `main` without authorization.

## Behavior
- Contributor URLs: `/?contributor=<opaque-id>`
- Open profile by clicking “By Jonathan F.” on Explore cards or a note's byline
- Profiles show the public display name, count of safe published notes, subjects, topics and published note cards
- Profile sharing and pagination work for signed-in and signed-out users
- Subject chips lead back to filtered Explore results
- Names are display labels only; profile identity comes from an opaque deterministic hash of the account's internal ID
- Counts and subject/topic summaries are based **only** on public notes with eligible files
- No user email, raw internal user ID, private note metadata, or moderator details are returned

## QA
- [ ] View Jonathan F. profile while signed in and while signed out; compare counts with Explore
- [ ] Two authors with the same public display name remain separate contributors
- [ ] Open a profile via Explore author link, note detail byline, and related note byline
- [ ] Share profile URL; paste in a private browser window and confirm it opens
- [ ] Open a published note from the profile; note link opens correctly
- [ ] Click a subject on the profile; filtered Explore opens
- [ ] Unpublish a note, refresh profile: it disappears and count drops; republish and verify return
- [ ] Remove via moderation: note disappears, restoring hold keeps note off until owner republishes
- [ ] Unsafe/malware-blocked file notes and private drafts are not exposed
- [ ] Unknown contributor URL: clear error, no account details
- [ ] 320px/390px mobile, 200% zoom, keyboard focus, and copy-link action
- [ ] Contributor with 13+ published notes gets pagination
- [ ] Existing public note SEO links, previews and reporting still work

## Scaling follow-up
This V1 intentionally reuses the DynamoDB scan pattern already used for public Explore. Before substantial library growth, add an indexed public-contributor listing/read model to avoid scanning all notes for profile lookups. No database migration in this batch.

## Automation
Run `python -m unittest discover -s tests -p 'test_public_contributor.py'` with Python 3.12 and boto3 available. This was authored as regression coverage; successful live AWS integration must be confirmed separately.
