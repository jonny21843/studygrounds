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

**Known limitations:** A quota reservation may remain consumed if a later downstream operation fails. The upload limit measures authorization attempts, not confirmed completed uploads, so repeated retries count. There is no daily publishing quota yet: publishing includes pending security scans and automatic publish transitions, and requires dedicated transactional/idempotent coverage. There is no per-account stored-byte quota yet; computing that safely requires S3 object accounting and deletion/replacement reconciliation. The current rate limits are not a substitute for WAF/bot mitigation at larger scale.

## Separate monitoring CloudFormation template

`infrastructure/monitoring.yaml` is **not** part of the automatic DEV or PROD app deployment. Its resources are isolated until a notification email is chosen and IAM/preflight are verified. The template includes:

- SNS operational alert topic and email subscription (requires manual recipient confirmation).
- CloudWatch HTTP API `5xx` alarm: at least five responses within five minutes.
- Malware scan-result Lambda error alarm: at least one error within five minutes.
- Upload authorization Lambda error alarm: at least three errors within five minutes.
- EventBridge rule for GuardDuty object-scan statuses `FAILED`, `UNSUPPORTED`, or `ACCESS_DENIED`, scoped to the StudyGrounds uploads bucket. Sends a generic notification, not user document content.
- Missing metrics do not generate an alarm.

### Preconditions before any monitoring deployment
1. Owner chooses the alert email and confirms that they can receive SNS email.
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
    AlertEmail=YOUR_CONFIRMED_EMAIL \
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
