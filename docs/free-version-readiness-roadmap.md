# StudyGrounds free-version launch readiness — November 19, 2026

All current work is confined to `develop`. Premium flashcards, quizzes, handwriting conversion and AI study tools remain out of scope.

## Implemented in this pass
- Browse-first Home welcome guide, including Explore, Share Your Notes, Saved Notes, and per-account browser-local dismissal.
- Private saved-note collections stored on each bookmark (separate from the note's existing topic). Filter applies to currently loaded bookmarks; load more for older bookmarks. No new DynamoDB tables.
- More from this contributor shortcut on public notes; existing focus mode, text-size, reading width and private annotation features preserved.
- Responsive styles for onboarding, saved collections and reader controls.
- Expandable publishing guidelines for copyright/permission, privacy, accurate metadata, spam and harassment.
- Extra DEV deploy smoke test verifying uploaded static frontend artifacts match built assets.

## Existing foundations found by code audit
- Cognito Hosted UI PKCE sign-in and token handling; reset password and email verification require a real-world signup/recovery acceptance test.
- Moderation, user reporting, feedback, malware scan and security admin tools.
- Public SEO pages, canonical URLs, sitemap, DEV noindex and structured data.
- DEV backend API and sitemap smoke tests, CI regression tests and deployment workflow.

## Outstanding launch blockers / acceptance work
1. **Account lifecycle:** Verify new-user email verification and forgotten-password flows in Cognito Hosted UI. Design and test full self-service data export and deletion across Cognito, notes, source objects in S3, bookmarks, study sessions, annotations, profiles, notifications, feedback and legally retained moderation/security records. These are NOT implemented by this pass; do not introduce a deletion button without cross-service cascade and retention policies.
2. **Spam prevention:** Audit note-creation and upload quotas, publish/unpublish limits, repeated reports and rate limiting. Existing malware scanning and reporting are not complete spam defenses.
3. **Monitoring:** Review CloudWatch retention, alert thresholds for API/Lambda 5xx and upload/scan failures, deployment failure notifications and incident escalation. A dashboard is not a substitute for production alarms.
4. **SEO/performance:** Check deployed CloudFront routing, public-note canonical/structured metadata, sitemap coverage, Search Console indexing, accessibility and Core Web Vitals on actual devices.
5. **Release:** Test with two accounts in DEV; complete existing production backend stack/IAM inventory and backend-first production release review before any `main` promotion.

## DEV acceptance
- Sign in with a new account: browse Explore, use Share Your Notes without auto-publishing, dismiss Home guide, switch accounts and confirm independent guide state.
- Save a public note and assign a new named collection; reload, change to Unsorted, filter by collection, load more and remove it.
- Verify note *topic* remains distinct from the bookmark's saved collection; same note can have different private bookmark labels for different accounts.
- Navigate from the public note viewer to more notes by that contributor; verify mobile focus mode, document navigation and preview.
- Read publishing guidelines; confirm existing report, moderation, account security and notifications work unchanged.
- Confirm latest DEV CI, backend-first deployment and frontend artifact checks pass. Production must remain untouched.
