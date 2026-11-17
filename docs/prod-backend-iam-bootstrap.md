# StudyGrounds: reuse existing PROD IAM deploy role

## Verified environment
- AWS account: `248189942252`; existing application stack: `studygrounds-prod`, `CREATE_COMPLETE`, `us-east-2`.
- Stack parameters `EnvironmentName=prod`, `ResourceNamePrefix=studygrounds-prod`, `SiteUrl=https://joinstudygrounds.com`, Cognito pool `us-east-2_450eBSuUP`, Cognito client `5s7dcd9viec7heodncol82eqtj`.
- Existing production API `vhtlpng5e3` matches the production frontend.
- Existing SAM artifact bucket: `aws-sam-cli-managed-default-samclisourcebucket-z4bksjkichi5`.
- Existing `StudyGroundsProductionDeploy` role trusts the production GitHub environment and has only frontend S3/CloudFront permissions. The production app stack has no recorded CloudFormation service role.

## Updated design (one new role, not two)
The **not-yet-applied** file `infrastructure/prod-backend-deploy-iam.yaml` creates:
1. **ONE** new IAM role: `StudyGroundsProdCloudFormationExecutionRole`, assumed by CloudFormation.
2. **ONE** new inline policy (`AWS::IAM::Policy`) attached to **existing** `StudyGroundsProductionDeploy`. This policy adds only production CloudFormation change-set, SAM artifact bucket and restricted `iam:PassRole` permissions. It does **not** recreate/change the GitHub role, alter its trust, or replace existing frontend policy.

The same GitHub production environment role secret can be used after verifying that `AWS_FRONTEND_DEPLOY_ROLE_ARN` actually points to `StudyGroundsProductionDeploy`. No new role secret is needed if so.

## Security and operational review before executing IAM
- This draft follows DEV's execution role permission pattern. Some permissions are broad: `apigateway:*`, `guardduty:*`, and wildcard actions within production-named Lambda/DynamoDB/S3 resources. Review whether these can be narrowed. Check IAM boundaries, resource ARNs, policy conditions, explicit denies and AWS Organizations SCPs.
- Verify CloudFormation-created production IAM role names and upload bucket names match `studygrounds-prod-*`. An IAM execution role for CloudFormation is powerful; an authorized person must review its effective scope.
- The existing application stack currently has no service role. Providing `--role-arn` when updating it establishes an ongoing CloudFormation execution role. Confirm this governance choice before applying a change set.
- CloudFormation will own the new execution role and the *new inline policy attachment* on the existing GitHub role. Deleting the IAM bootstrap stack would remove those backend permissions and the execution role.
- Do not merge into main: PROD backend placeholder is still non-deploying, while PROD frontend auto-deploys on `main`.

## Read-only checks
```powershell
aws iam get-role --role-name StudyGroundsProductionDeploy --query "Role.Arn" --output text
aws iam list-role-policies --role-name StudyGroundsProductionDeploy --output json
aws iam list-attached-role-policies --role-name StudyGroundsProductionDeploy --output json
aws cloudformation describe-stacks --stack-name studygrounds-prod --region us-east-2 --query "Stacks[0].{Status:StackStatus,RoleARN:RoleARN}" --output json
```

Before enabling any backend workflow, confirm its **production** GitHub role secret resolves to `StudyGroundsProductionDeploy`. Never use DEV IDs, profiles, or `samconfig.toml` DEV defaults.

## Applying the IAM bootstrap (approval required; do not run yet)
Use a **separate** CloudFormation IAM bootstrap stack (e.g. `studygrounds-prod-backend-iam`) and `CAPABILITY_NAMED_IAM` to create a reviewed change set. It must not target the existing app stack. Review the exact new role, trust policy, inline policy and IAM changes before execution. Only apply after explicit approval.

After applying IAM, validate the GitHub OIDC assume-role path, examine a CloudFormation change set for **existing** `studygrounds-prod` and verify there are no unintended replacements or deletions. Backend first, production frontend second. Keep the existing production backend workflow disabled until the complete configuration and change set are reviewed.

No AWS IAM action or production deployment has been performed by this draft.
