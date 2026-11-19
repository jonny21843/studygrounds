# StudyGrounds legal document release procedure

Current effective date: 2026-11-19. Original prototype legal versions: terms 1.0 and privacy 1.0. Revised DEV draft legal versions: terms 1.1 and privacy 1.1. Drafts require owner/legal review before production.

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
