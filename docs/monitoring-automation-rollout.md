# StudyGrounds monitoring automation: DEV now, PROD later

All code is authored on `develop`. The monitoring resources are **separate CloudFormation stacks**, not part of the application SAM stack. The GitHub Actions workflow never automatically bootstraps IAM.

## Environment boundaries

| Item | DEV | PROD |
|---|---|---|
| Existing app stack | `notes-app-dev` | `studygrounds-prod` |
| One-time IAM bootstrap template | `infrastructure/dev-monitoring-iam-bootstrap.yaml` | `infrastructure/prod-monitoring-iam-bootstrap.yaml` |
| One-time IAM bootstrap stack | `studygrounds-dev-monitoring-bootstrap` | `studygrounds-prod-monitoring-bootstrap` |
| Monitoring service role | `StudyGroundsDevMonitoringExecutionRole` | `StudyGroundsProdMonitoringExecutionRole` |
| Monitoring stack | `studygrounds-dev-observability` | `studygrounds-prod-observability` |
| SNS topic | `studygrounds-dev-operational-alerts` | `studygrounds-prod-operational-alerts` |
| Existing GitHub AWS OIDC role | `StudyGroundsDevDeploy` | `StudyGroundsProductionDeploy` |
| GitHub Actions environment | `development` | `production` |
| Automatic changes | DEV pushes that affect monitoring | **Disabled** until explicit repository opt-in |
| Manual changes | Dispatch from `develop` | Dispatch from `main` only |

The shared alarm template is `infrastructure/monitoring.yaml`. It obtains actual API ID, malware Lambda, upload Lambda and S3 bucket via `aws cloudformation list-stack-resources` at deployment time; those resource names are **not assumed or duplicated**. API IDs are checked against the known application API for each environment. GitHub's existing AWS role secret is used in its corresponding protected environment; no new long-lived AWS keys.

## One-time AWS Console step (DEV first)

1. Open AWS Console, region **us-east-2**, CloudFormation → Create stack → choose *Upload a template file*; upload the raw file `infrastructure/dev-monitoring-iam-bootstrap.yaml` from the current `develop` branch. **Do not upload `infrastructure/monitoring.yaml` for this step.**
2. Name the new stack **`studygrounds-dev-monitoring-bootstrap`**. Leave the IAM role parameter set to `StudyGroundsDevDeploy`.
3. Review changes; acknowledge **CAPABILITY_NAMED_IAM**, since the template creates a named CloudFormation execution role and attaches a narrow inline policy to the existing GitHub role. This changes DEV IAM only, not the application stack. Confirm the stack reaches **CREATE_COMPLETE**.
4. In GitHub → Actions → **Deploy StudyGrounds monitoring**, use **Run workflow** with branch `develop` and target `dev`. The workflow verifies AWS account/role, resolves live stack physical IDs, and deploys **`studygrounds-dev-observability`**.
5. Check CloudFormation for successful monitoring stack creation. Confirm the AWS SNS subscription email at **jonathan.feagans@outlook.com**; without confirmation, delivery is not active. Safely test notification delivery using a test alarm event rather than uploading malware.
6. Subsequent monitoring-template changes to `develop` auto-update the DEV monitoring stack. A successful GitHub workflow with the bootstrap missing means it was intentionally *skipped*, not installed—look at the workflow summary.

## Production readiness — prepare now, activate only when approved

Production monitoring requires a **separate** one-time IAM bootstrap, `infrastructure/prod-monitoring-iam-bootstrap.yaml`, in AWS Console as stack **`studygrounds-prod-monitoring-bootstrap`**. This file does not alter the existing app stack, but **does modify the existing production GitHub role's IAM permissions** to permit only the separate monitoring stack. Review its change set and execution permissions before use.

Do **not** run this PROD bootstrap before explicit production authorization. After the complete free app is DEV-accepted and promoted to `main` with owner approval:

1. Review existing production API/Lambda/bucket physical IDs, deployment IAM and monitoring costs; confirm `main` contains the monitoring workflow.
2. Owner explicitly approves applying the PROD IAM bootstrap. Create it through AWS Console with `CAPABILITY_NAMED_IAM`.
3. Manually run **Deploy StudyGrounds monitoring** from branch `main`, target `prod`. Confirm the *separate* PROD SNS subscription email.
4. After confirming PROD alarm delivery and DEV/PROD isolation, set the GitHub **repository variable** `STUDYGROUNDS_PROD_MONITORING_ENABLED=true` if desired. Only then can future pushes to `main` that change monitoring files update the PROD monitoring stack automatically. Until that explicit opt-in, `main` pushes don't deploy monitoring.

**No production AWS resources or IAM permissions have been changed by adding this code to `develop`.**

## Verification boundaries

The GitHub verification workflow lints all three monitoring/ IAM CloudFormation templates and runs app regressions. It does not confirm subscriber acceptance, alert delivery or live CloudFormation execution. The monitoring deployment workflow requires successful bootstrap and reports whether actual monitoring deployment was run.

Logs and SNS alerts should contain service/incident identifiers only, not users' uploaded notes, file content, or secrets.
