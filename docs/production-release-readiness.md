# StudyGrounds production release readiness — 2026-11-17

**Production remains unchanged.** DEV branch has end-to-end-tested discovery, Saved Notes, Helpful Votes, reader improvements, and private study tools. Frontend/backend DEV workflows succeeded at `b16208e` before the verification changes. New CI and read-only AWS audit are staged on `develop`; don't interpret a successful deployment as automated test pass.

## Why promotion is blocked

1. `.github/workflows/deploy-prod-backend.yml` is a deliberate no-deploy placeholder. A merge to `main` will deploy the frontend via `deploy-prod-frontend.yml` unless that release is coordinated; the backend is not deployed automatically.
2. Existing PROD stack, API, Cognito, NotesBucket, GuardDuty plan and the newer feature resources must be inventoried in AWS, not inferred from GitHub configs.
3. PROD GitHub OIDC role and CloudFormation execution role must be inspected for IAM/CloudFormation permissions. DEV policy updates do **not** necessarily update corresponding PROD roles.
4. DEV and PROD workflows were named separately. `main` historically has `.github/workflows/deploy-frontend.yml` (same prod site). The no-op reconciliation merge on `develop` incorporates that historical commit and intentionally retains only the newer `deploy-prod-frontend.yml` to prevent duplicate production triggers.
5. The new `verify.yml` CI runs mock-backed Python regressions, JS syntax and SAM validation/build. Require a green run and review failures before deploying.

## Read-only production inventory (no changes)

GitHub Actions workflow `Audit StudyGrounds AWS backend (read only)` accepts environment `production`, the existing backend stack name **from AWS Console**, and expected account ID. It uses `AWS_FRONTEND_DEPLOY_ROLE_ARN` from the chosen GitHub environment. This may be unable to inspect IAM or CloudFormation if that role has only frontend S3/CloudFront rights. Missing access produces a warning or blocker; do not expand PROD IAM blindly. Note: GitHub manual-dispatch workflows may need to exist on the repository default branch before appearing under Actions.

To run the same read-only inspection locally using an AWS profile with *read* permissions:

```powershell
$env:AWS_PROFILE = "YOUR_AWS_PROFILE"
$env:STUDY_TARGET = "production"
$env:STUDY_STACK = "ACTUAL_EXISTING_BACKEND_STACK_NAME"
$env:STUDY_ACCOUNT = "248189942252"
python -m pip install boto3
python scripts/audit_aws_backend_readonly.py
```

This outputs `aws-backend-readiness.json` locally. Do not commit the report if it contains account/role details; share a redacted summary if needed.

Cross-check the actual production API base URL against the production frontend config (`vhtlpng5e3.execute-api.us-east-2.amazonaws.com`), its Cognito client ID (`5s7dcd9viec7heodncol82eqtj`), origin `https://joinstudygrounds.com`, and the production stack's `ResourceNamePrefix`. Production SAM deployment must use explicit **PROD** parameters rather than `samconfig.toml` defaults (which point to DEV).

### IAM checks (compare with development, do not copy automatically)

- GitHub OIDC assume-role trust policy: correct repository and protected production environment, with no DEV-only branch assumptions.
- GitHub role CloudFormation permissions: `DescribeStacks`, `CreateChangeSet`, `DescribeChangeSet`, `ExecuteChangeSet`, appropriate S3 packaging/upload permissions, and `iam:PassRole` for the *production* CloudFormation execution role.
- CloudFormation execution role: scoped create/update/delete capabilities for Lambda functions, API Gateway HTTP API, DynamoDB and GSIs, CloudWatch logs, S3 objects/bucket policies, GuardDuty malware plan, EventBridge, and associated IAM roles.
- Check policy documents, permissions boundaries, explicit denies, and AWS Organizations SCPs. Policy names alone do not prove allowed actions. Remember CloudFormation policies for newly added resources may be different from those in the original PROD stack.
- PROD StackName and region (backend `us-east-2`) must match the existing stack; reject any accidental new-stack creation. Do not reuse DEV CloudFormation execution role or DEV Cognito client IDs.

## Release sequence — after preflight

1. Confirm `verify.yml` green and verify DEV remains functional after the CI-only push.
2. Inventory production backend stack and compare PROD/DEV IAM effective permissions, focusing on the new SAM resources and deployment execution path.
3. Create **production-specific** manual backend deploy workflow only when actual stack, role and Cognito params have been confirmed. Use explicit stack existence check, change-set review and least-privilege OIDC credentials; keep production backend no-deploy placeholder until then.
4. Ensure production backend schema and Lambdas deploy successfully **before** releasing the updated frontend. Never let a backend-incompatible frontend automatically deploy while backend is pending.
5. Confirm Saved Notes, StudyActivity and HelpfulVotes tables, GuardDuty, auth, public-note endpoints, study/history, and auto-saving annotations on production.
6. Only then promote frontend, smoke-test production with two different accounts and roll back frontend if needed.

No PROD stack, role, policy, deployment workflow, or production branch changes have been authorized or executed by this readiness work.
