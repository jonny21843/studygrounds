# StudyGrounds abuse protection and monitoring — DEV rollout

## Already verified manually
- The owner tested new-account email verification and password recovery, both working in DEV.
- New-account Home onboarding guide was visually inspected in DEV.

## Current protection

Default HTTP API throttle: 15 requests/sec with burst 30, plus lower per-route throttles for uploads and previews.

This phase adds **per-account UTC-day atomic counters** stored as `USER#<id> / QUOTA#YYYY-MM-DD#<action>` in the existing DynamoDB Preferences table. Counters have `expiresAt` TTL three days after the daily reset; the date in the key makes them reset regardless of TTL cleanup lag.

- Note creation: 30 validated requests/day.
- Presigned upload authorization: 30 requests/day (not confirmed successful S3 uploads).
- New public-note reports: 10/day, after first checking for an existing report by the same user.
- Exceeding a limit returns HTTP 429 with a specific `DAILY_*_LIMIT` code and a message explaining the UTC reset.
- These quotas are **free-version abuse safeguards**, not paid membership entitlement rules.
- File-size maximum, allowed file extensions/types, per-note attachment limits and GuardDuty malware protection continue unchanged.
- Keep 429 error cases and rapid retries in DEV acceptance. Quota counters are deliberately atomic to avoid concurrent request races.

## Added publication and storage safeguards (November 19)

- **Publication actions: 10/day per account** (UTC). Count a private note's accepted request to publish, including when it must wait for a GuardDuty scan. Repeating Publish while already public or while already pending does not consume an additional slot. Unpublishing is unrestricted. The counter uses the same atomic DynamoDB quota method; it is **not** a limit on distinct notes or a charge to users.
- **Delayed scan protections:** A completed GuardDuty scan can only automatically publish if the note is still pending and has not acquired a moderation hold; a currently restricted security profile also blocks automatic publication. A previously sent Unpublish command clears pending publication, and delayed scan completion will not reverse that choice.
- **1 GiB account source-file storage safeguard:** At presigned-upload authorization, list currently stored S3 objects under the authenticated account prefix and reject projected excess usage. At file registration, re-check actual storage usage and delete the new unregistered object when above the limit. For replacement uploads, the old registered file's size is credited toward projected post-replacement usage. S3 objects left by incomplete uploads count until removed.
- Current individual file size (20 MiB), per-note file count (10), malware scanning, and existing daily creation/upload/report protections remain unchanged.

**Limitations and follow-ups:** S3 listing is real-time but **not an atomic storage reservation**. Two simultaneous upload requests can both pass an initial check, so the per-account byte limit is a best-effort safeguard, not a guarantee against all concurrent overage. S3 current-object listing also does not calculate retained versions or all billing dimensions. A reserved daily publication slot is not refunded if a subsequent conditional update fails, and a second private-to-public transition later in the same day counts again. We should evaluate transaction-based upload reservations, byte accounting, orphan cleanup, and administrator override mechanisms before expecting heavy usage. The current rate limits are not a substitute for WAF/bot mitigation at larger scale.

**DEV acceptance for this batch:** Confirm a normal file under the limit uploads and registers, a replacement works, publication succeeds immediately or after a clean scan, duplicate Publish is idempotent, Unpublish before a scan is respected, and 429/413 errors are clear. Automated checks are in `tests/test_publish_and_storage_protection.py`. Use mocked/injected quotas in tests rather than exhausting a real user's daily allowance.

## Separate monitoring CloudFormation template

`infrastructure/monitoring.yaml` is **not** part of the automatic DEV or PROD app deployment. Its resources are isolated until a notification email is chosen and IAM/preflight are verified. The template includes:

- SNS operational alert topic and email subscription (requires manual recipient confirmation).
- CloudWatch HTTP API `5xx` alarm: at least five responses within five minutes.
- Malware scan-result Lambda error alarm: at least one error within five minutes.
- Upload authorization Lambda error alarm: at least three errors within five minutes.
- EventBridge rule for GuardDuty object-scan statuses `FAILED`, `UNSUPPORTED`, or `ACCESS_DENIED`, scoped to the StudyGrounds uploads bucket. Sends a generic notification, not user document content.
- Missing metrics do not generate an alarm.

### Preconditions before any monitoring deployment
1. Alert destination selected for DEV: `jonathan.feagans@outlook.com`. The monitoring template defaults to this email; an SNS subscription confirmation email will be sent only when the separate monitoring stack is actually deployed. The recipient must click the confirmation link before alerts can arrive.
2. Read the existing DEV CloudFormation stack outputs and resources to determine actual `ApiId`, `MalwareFunctionName`, `UploadFunctionName` and `NotesBucketName`; do not guess from a function's logical name.
3. Check that the deployment IAM principal can create SNS, CloudWatch alarms, EventBridge rules and topic resource policies. If not, add scoped permissions through a separate reviewed IAM change. Don't expand the normal app deployment role silently.
4. Review CloudWatch/SNS/EventBridge costs and alert thresholds. DEV and PROD must have separate topics, alert names and recipient confirmation.
5. Deploy the monitoring template to a separate DEV stack only. Confirm subscription by clicking the email link; exercise a *safe* test using CloudWatch alarm test state or a test event without real malware. Verify notification and recovery; do not test by uploading malware. PROD requires a separate explicit approval and actual production API/bucket/function IDs.

### Example DEV deployment only (after preflight)
```bash
aws cloudformation deploy \
  --stack-name studygrounds-dev-observability \
  --region us-east-2 \
  --template-file infrastructure/monitoring.yaml \
  --parameter-overrides \
    EnvironmentName=dev \
    AlertEmail=jonathan.feagans@outlook.com \
    ApiId=ACTUAL_DEV_API_ID \
    MalwareFunctionName=ACTUAL_DEV_MALWARE_HANDLER \
    UploadFunctionName=ACTUAL_DEV_UPLOAD_HANDLER \
    NotesBucketName=ACTUAL_DEV_UPLOAD_BUCKET
```

To monitor GitHub Actions deployment failures, enable GitHub Actions notifications under GitHub account settings; dedicated GitHub-to-SNS event forwarding can be considered later if built-in alerts are insufficient.

## DEV acceptance
- Run automated tests (`tests/test_abuse_limits.py` plus full regression suite).
- Test low limits in isolated DEV settings to produce 429 without making thirty real notes. Check duplicate reports do not consume another report quota.
- Verify the current free user can still create, publish and upload safely.
- Check alarms with a confirmed subscriber; confirm operational events do not contain source-file text, names or account secrets.
- Do not merge `main` or deploy production without explicit authorization.

## Remaining tasks
- Backend publishing rate limits, per-account storage accounting, error-budget monitoring and frontend performance checks.
- Separate self-service data export and permanent account deletion design.
