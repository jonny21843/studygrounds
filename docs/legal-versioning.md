# StudyGrounds legal document release procedure

Current effective date: 2026-11-19. Initial legal versions: terms 1.0 and privacy 1.0. Drafts require owner/legal review before production.

- Public legal documents: `terms.html`, `privacy.html`, `community-guidelines.html`.
- Server manifest: `backend/functions/legal/app.py` DOCUMENTS; shared guard checks the versions passed in SAM environment variables.
- SAM configuration: `infrastructure/template.yaml` Globals Function Environment and LegalFunction environment.
- Increment required document version in **both** the manifest configuration and SAM Globals on a substantive revision, and preserve old text in `docs/legal-history/`.
- Update effective dates and public pages, review the disclosure against actual architecture, test in DEV before production.
- Existing acceptance records are immutable per user + document + version in PreferencesTable. New versions require fresh affirmation/acknowledgement. Typographical corrections should not silently change legally operative text.
- Never silently treat a new privacy purpose as consent; obtain any separate legally required opt-in.
- Test new and returning users, direct API write rejection (428), document links, logout, expired sessions, and all write handlers.
- Production deploy should use production-specific DynamoDB resources, IAM and Cognito; do not copy DEV table data.
- This is an implementation draft, not legal advice. Verify company/operator details, applicable state law, minors policy, data retention, copyright procedures, and support contact before release.
