# StudyGrounds DEV data-retention and deletion audit — 2026-11-19

## Inventory grounded in `infrastructure/template.yaml`

| Storage | Data | Current repository behavior | Retention verification |
| --- | --- | --- | --- |
| Cognito | Account credentials, verified email, names | Stored while registered; queued worker deletes account | Confirm Cognito user-pool setting and recovery process |
| NotesTable | Private/public notes, source metadata | Account-deletion worker removes partition | DynamoDB PITR enabled; inspect configured recovery window in AWS |
| NotesBucket (S3) | Uploaded PDF/image/document sources | Account deletion removes `users/{sub}/` objects after presigned uploads expire | Versioning/lifecycle and backups **not verified in AWS** |
| SavedNotesTable | Bookmarks | Per-user partition deleted | DynamoDB PITR enabled |
| StudyActivityTable | Study progress, sessions, annotations | Per-user partition deleted | DynamoDB PITR enabled |
| HelpfulVotesTable | Votes made by user | Per-user partition deleted | DynamoDB PITR enabled; note aggregates may require reconciliation |
| PreferencesTable | Profile, notices, legal acceptances | All per-user items cleared at deletion | TTL on `expiresAt`; legal evidence deleted with account |
| UserSecurityTable | Strike and security records | Per-user partition deleted | Security exceptions/incident-retention policy needs review |
| FeedbackTable | Feedback and submitter email | User-owned feedback removed; rate-limit key removed | Other feedback/administrative records remain |
| ModerationReportsTable | Abuse/copyright case history | Reporter/owner identity fields removed for deleted users; case history kept | Legal retention and case-handling process still requires review |
| CloudWatch | Lambda/API access and error logs | Not controlled by account deletion | **Actual log retention is unknown** |
| AWS-managed recoverability | DynamoDB PITR, possible backups | Older copies may remain during retention window | Verify snapshots/PITR in AWS; no instant-backup-deletion promise |

## Proposed principles

- Offer self-service permanent deletion in Settings with exact typed confirmation.
- Treat deletion as queued, not instant: SQS worker starts after a six-minute delay so previously issued S3 upload URLs expire.
- Block authenticated writes while deletion is pending. Worker deletes Cognito identity only after cleanup.
- Record failures in a dead-letter queue for operator retry; monitor it before PROD.
- Manual privacy and data-access requests: `privacy@joinstudygrounds.com`. A self-service full data export does not currently exist.
- Do not publish fixed 30/90-day retention promises until AWS settings and logs are confirmed.
- CloudFront and external users may retain previously downloaded public files.
- Do not assume deleted S3 objects are unrecoverable from copies/backups.
- Rate-limit and moderation record cleanup have different legal/abuse considerations.

## Release blockers / follow-ups

1. Verify AWS deployment IAM permissions for SQS and account-deletion Lambda role.
2. Exercise real DEV deletion with a disposable account containing notes, uploads, saves, comments, votes, and feedback; verify Cognito, DynamoDB, and S3 cleanup and retry behavior.
3. Monitor `AccountDeletionDeadLetterQueue` and configure alert delivery (SNS). A dead-letter message requires prompt manual remediation.
4. Confirm CloudWatch retention, S3 versioning/lifecycle, DynamoDB PITR and backup inventory using a read-only AWS audit.
5. Implement Cognito-side age enforcement or alternative compliant signup architecture; a page-level gate alone cannot constrain direct hosted signup.
6. Define the handling of valid preservation/hold obligations, audit records, and account access/export requests.
7. Verify DMCA handling and ensure required designated-agent contact disclosure meets applicable law.
8. Have the operator/legal counsel review final Terms and Privacy copy before shipping `main`.

This is a code-level inventory, **not an assertion that the live AWS retention settings were checked**.

### DEV user test checklist

1. Register a disposable account through the public age gate and review Terms/Privacy.
2. Copy its account ID from Settings → Privacy & Data before deletion.
3. Upload a file and create a note, save a different note, optionally submit feedback.
4. Request deletion, record the SQS delayed message; do not purge it.
5. After processing, verify the Cognito user is missing, and all relevant user partitions query empty using the saved ID.
6. Check the DEV upload bucket has no objects under `users/{sub}/` and the dead-letter queue remains empty.
7. Verify previously registered users are not shown the 13+ checkbox when only a policy version needs updating.
