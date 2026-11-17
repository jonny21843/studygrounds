# StudyGrounds production backend IAM bootstrap — review before any AWS writes

## Verified facts (November 17, 2026)
- Existing production application CloudFormation stack: `studygrounds-prod`, status `CREATE_COMPLETE`.
- `StudyGroundsProductionDeploy` has only `StudyGroundsProdFrontendDeployPolicy` (production S3/CloudFront); there are NO listed backend permissions.
- `StudyGroundsFrontendDeploy` is another production-trusted role but its policy points at the *old DEV frontend* S3 bucket/CloudFront distribution. Do not use it for backend.
- `StudyGroundsDevDeploy` has DEV backend change-set/SAM packaging/PassRole permissions.
- `StudyGroundsDevCloudFormationExecutionRole` has DEV-scoped IAM/Lambda/DynamoDB/S3/GD/API/EventBridge permissions. Neither is a production backend role.
- Existing production stack has no recorded `RoleARN`; introducing a service role changes the stack's ongoing deployment authority. Review this carefully.

## Proposed separation
The **draft** template `infrastructure/prod-backend-deploy-iam.yaml` creates two NEW roles only; it does not modify the existing production frontend role or the app stack:
1. `StudyGroundsProdBackendDeploy`, OIDC trust limited to the GitHub repo's production environment, with CloudFormation operations scoped to the existing `studygrounds-prod` stack, SAM packaging S3 access, and PassRole to only the role below.
2. `StudyGroundsProdCloudFormationExecutionRole`, trust limited to `cloudformation.amazonaws.com`, permissions based on the known-good DEV execution role but with production resource names.

**Review required:** Some actions remain broad (`apigateway:*`, `guardduty:*`) because the currently working DEV policy uses them. Tighten after CloudFormation API resource ARNs have been inventoried. The template is a starting point, not an effective permission guarantee; IAM conditions, permissions boundaries, SCPs and artifact bucket names must be reviewed. Do NOT apply it without reviewing these statements and the stack's historical template/parameters.

## Next read-only checks on Windows (before bootstrap)
```powershell
# Confirm PRODUCTION stack inputs (no secrets needed).
aws cloudformation describe-stacks --region us-east-2 --stack-name studygrounds-prod --query "Stacks[0].{Status:StackStatus,RoleARN:RoleARN,Parameters:Parameters}" --output json

# Find existing managed SAM artifact buckets so the draft IAM S3 glob can be checked.
aws s3api list-buckets --query "Buckets[?contains(Name, 'samclisourcebucket')].Name" --output json

# Verify main production API logical resource/physical ID.
aws cloudformation describe-stack-resource --region us-east-2 --stack-name studygrounds-prod --logical-resource-id NotesApi --query "StackResourceDetail.{LogicalId:LogicalResourceId,PhysicalId:PhysicalResourceId}" --output json
```

Check `EnvironmentName=prod`, a non-empty `ResourceNamePrefix`, PROD `CognitoUserPoolId`, PROD `CognitoAppClientId`, `SiteUrl=https://joinstudygrounds.com`, and allowed origins. Verify the NotesApi physical ID is the same API the PROD frontend points to. **If any differs, stop.**

## Approval-dependent bootstrap (NOT executed)
If the read-only checks match expectations and the template/policies are reviewed, a privileged AWS operator can provision these new roles in a **separate** CloudFormation IAM bootstrap stack. The production application stack must be left alone at this stage. Creating IAM roles is an AWS change requiring explicit authorization and `CAPABILITY_NAMED_IAM`.

After provisioning, add a `production` GitHub *environment-scoped secret* named `AWS_BACKEND_DEPLOY_ROLE_ARN` set to the new `BackendGithubRoleArn`. Do **not** reuse `AWS_FRONTEND_DEPLOY_ROLE_ARN` or point this secret to any DEV role. Require GitHub production environment approvals.

The production backend workflow `.github/workflows/deploy-prod-backend.yml` remains non-deploying. It must only be enabled **after**:
- `studygrounds-prod` stack exists and has exact matching PROD parameters (not the DEV defaults in `samconfig.toml`).
- A read-only inspection of the currently deployed template to avoid unexpected resource replacements.
- A GitHub production-environment OIDC assume-role test and permission review.
- A human-reviewed CloudFormation change set. Only execute after confirmation.
- PROD backend must be deployed *before* the new frontend on `main`. The frontend currently auto-deploys on changes to `main`, so don't merge until backend schema/handlers are present.

**Never** create a second production application stack or update DEV resource policy targets to production. No bootstrap or production release was executed in this preparation.
