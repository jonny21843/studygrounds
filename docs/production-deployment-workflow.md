# StudyGrounds production release process

The single production workflow is `.github/workflows/deploy-prod-frontend.yml` (display name **Deploy StudyGrounds PROD (backend then frontend)**). It runs on **every push to main**, including a develop -> main merge, irrespective of changed file paths.

1. Run backend with GitHub `production` environment OIDC role `StudyGroundsProductionDeploy`; verify AWS account, stack and NotesApi ID.
2. SAM deploy **existing** `studygrounds-prod` in `us-east-2`, using `StudyGroundsProdCloudFormationExecutionRole`, the existing SAM artifact bucket and explicitly pinned PROD parameters (never samconfig.toml DEV defaults).
3. Verify stack is `UPDATE_COMPLETE`, check the exact API base URL, and make a read-only public-notes API request.
4. **Only on backend success**, deploy frontend S3/CloudFront in `us-east-1`. Frontend and backend use the *same* workflow commit. No independent frontend push deploy remains.
5. Concurrency serializes production releases and does not cancel deployments in progress.

## First release cautions

The pre-existing manually created review change set `studygrounds-backend-release-review` was **not executed** and will not be reused. The workflow creates its own deployment change set and automatically executes it on successful SAM build; review the PR before merging. Delete the obsolete manual change set separately after determining it is no longer needed. Do not execute it after merging.

Confirm GitHub `production` environment secret `AWS_FRONTEND_DEPLOY_ROLE_ARN` points to existing `arn:aws:iam::248189942252:role/StudyGroundsProductionDeploy`. The trust is already scoped to the production GitHub environment. The configured production IAM bootstrap stack `studygrounds-prod-backend-iam` was manually created and verified.

For this **first** larger release, review existing production change-set risk, preserve critical production data, and have rollback steps ready. An S3/CloudFront frontend deploy is not automatically rolled back if a post-deployment issue is discovered. Existing Lambda permissions may be temporarily replaced. Observe Actions and CloudFormation events for unexpected updates or IAM AccessDenied errors. An IAM permission-policy attachment proves the policy exists, not that permissions can never fail during deployment.

Never merge production workflow changes without checking that GitHub production environment protection rules/approvals are appropriate. Approvals may gate backend and frontend separately because they are distinct jobs in the same environment.

DEV deploy still happens on develop; PROD backend and frontend only on main.
