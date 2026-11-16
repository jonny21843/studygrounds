# StudyGrounds DEV launch-readiness QA — November 2026

Scope: session/auth edge cases, keyboard accessibility, and stale request handling.
Changes are frontend-only and must be verified on `https://dev.joinstudygrounds.com`.

## Authentication and session

- [ ] Sign in normally; My Notes, Settings, and applicable admin tabs remain usable
- [ ] Sign out normally; private notes and admin screens are inaccessible
- [ ] In DEV browser developer tools > Application > Session Storage, change `token_expires_at` to `1`; switch away from the tab and back. The signed-in UI should disappear and public Explore should remain available
- [ ] With an expired session, attempt to open My Notes or submit an authenticated action. A clear sign-in-required/expired-session error should appear, rather than a backend raw response
- [ ] With a valid token, simulate an API 401 response for a notes request; the app should clear the session and not re-render prior private notes
- [ ] Simulate an admin request returning 403 (not authorized). Verify it does **not** sign the user out; 401 should expire the session
- [ ] After expiry, sign in again and confirm a new session works
- [ ] Quickly switch tabs while a notes request is in flight; a stale response must not overwrite the newer one

## Accessibility and responsive

- [ ] From the page top, press Tab. A visible “Skip to main content” link should appear; Enter should move focus into main content
- [ ] The selected navigation button is announced as current by assistive technology
- [ ] Search input has an accessible name, “Search public notes”
- [ ] Tab through Explore controls, paging and Back to Explore; visible focus outline is present
- [ ] Test Explore, note detail and auth bar at 320px, 390px, 768px, desktop, and 200% browser zoom
- [ ] Screen reader announces sign-in status changes without disrupting navigation

## Regression

- [ ] Published notes remain available without signing in
- [ ] Publishing, file previews, reporting, moderation holds and restore continue to work
- [ ] Shared note URLs open without authentication
- [ ] No PROD backend, PROD frontend or `main` changes are included

## Verification levels

- JavaScript syntax validation: can be checked before push
- Branch + diff review: can be checked before push
- Browser and Lambda/API integration: **manual DEV QA required**, not implied by a successful syntax check
