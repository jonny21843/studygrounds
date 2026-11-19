# StudyGrounds legal document release procedure

Current effective date: 2026-11-19. Original prototype legal versions: terms 1.0 and privacy 1.0. Revised DEV draft legal versions: terms 1.2 and privacy 1.2. Drafts require owner/legal review before production.

- Public legal documents: `terms.html`, `privacy.html`, `community-guidelines.html`, `copyright.html`.
- Server manifest: `backend/functions/legal/app.py` DOCUMENTS; shared guard checks the versions passed in SAM environment variables.
- SAM configuration: `infrastructure/template.yaml` Globals Function Environment and LegalFunction environment.
- Increment required document version in **both** the manifest configuration and SAM Globals on a substantive revision, and preserve old text in `docs/legal-history/`.
- Update effective dates and public pages, review the disclosure against actual architecture, test in DEV before production.
- Existing acceptance records are immutable per user + document + version in PreferencesTable. New versions require fresh affirmation/acknowledgement. Typographical corrections should not silently change legally operative text.
- Never silently treat a new privacy purpose as consent; obtain any separate legally required opt-in.
- Test new and returning users, direct API write rejection (428), document links, logout, expired sessions, and all write handlers.
- Production deploy should use production-specific DynamoDB resources, IAM and Cognito; do not copy DEV table data.
- Current confirmed operator: **Jonathan Feagans, individually operating as StudyGrounds**. If the service later transfers to an LLC, update the legal operator identity, notices, and any relevant service accounts and registrations.
- This is an implementation draft, not legal advice. Confirm applicable state law, 13+ onboarding implementation, data retention, DMCA registration and complaint handling, and working support/privacy/copyright contacts before release.
- These pages are still marked draft. **Before production, finalize the documents, preserve a frozen copy of each version, and increment the required versions** so earlier DEV acknowledgements are not presented as agreement to materially revised text.

## Verifiable acceptance evidence

Run `python scripts/build_legal_manifest.py` before SAM builds. The build script
fingerprints each public legal HTML page with SHA-256 and copies the release
manifest into the packaged legal Lambda. Browser acceptance reads and hashes the
served Terms and Privacy pages and the API rejects mismatches (including
backend-first deployment windows). Records contain the document version, SHA-256
fingerprint, server timestamp and age confirmation. Never edit published
substantive legal copy without a new version and preservation in
`docs/legal-history/`. Operator/legal approval of the final legal copy is
still required before PROD.

## Account data handling

Settings includes a confirmed deletion request. A dedicated authenticated API
queues a delayed SQS worker that removes user-owned DynamoDB items, user S3
uploads, Cognito credentials, and user feedback; it pseudonymizes corresponding
moderation records. SQS redrive maintains failed requests for investigation.
The worker remains unverified in real AWS until DEV integration testing.
Review actual DynamoDB point-in-time backups, CloudWatch retention, and any
offsite copies before promising a deletion SLA.

## One-time age eligibility (DEV)

The pre-Cognito sign-up UI asks prospective new users to affirm they are 13+.
Once authenticated, the first legal acceptance saves an independent
`PreferencesTable` record (`pk=USER#sub, sk=AGE#13_PLUS`) with timestamp.
During a transition, previously verified `LEGAL#terms#1.1` or
`LEGAL#terms#1.2` records containing `age13OrOlderConfirmed: true` are
migrated into this independent record on legal status checks.
Subsequent Terms and Privacy revisions **do not repeat** the age prompt;
only policy versions with outstanding acknowledgements are shown.
This is a self-attestation, not proof of age. Direct use of Cognito's hosted
signup remains a separate enforcement gap before a production release.

## Signup age declaration display

The StudyGrounds signup button records a session-scoped, non-authoritative
flag after a user affirms age before being redirected to Cognito. On return,
that flag suppresses a **duplicate** age checkbox in the initial legal popup;
the backend still requires an affirmative `age13OrOlder: true` on first
legal acceptance and records the independent account fact. A bypassed or
external Cognito signup must confirm age after authentication. The signup
flag is cleared on successful acceptance, signout, or existing-account login.
Settings displays the user's own opaque account ID to facilitate a safe DEV
account-deletion verification without exposing another user's data.
