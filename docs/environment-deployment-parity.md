# StudyGrounds development / production deployment parity

Both environments use a **single ordered workflow on every push**:
- DEV `develop` -> `.github/workflows/deploy-dev-frontend.yml`.
- PROD `main` -> `.github/workflows/deploy-prod-frontend.yml`.

Each workflow:
1. Check out the exact release commit and assume that environment's GitHub OIDC role.
2. Verify the expected AWS account, existing stack health and NotesApi ID.
3. Build and SAM deploy the **existing** backend stack using the respective CloudFormation execution role and explicit environment parameters.
4. Verify backend stack status and API base URL, smoke-test `GET /api/public/notes`.
5. **Only after backend succeeds**, publish frontend S3 assets and invalidate CloudFront.
6. Serialize releases within the environment without cancelling in-progress deployments.

Code and validation order are the same. Only resource references differ: DEV uses `notes-app-dev`, `nxa9uz2cv0`, `StudyGroundsDevDeploy`, `StudyGroundsDevCloudFormationExecutionRole`, Cognito `us-east-2_sZ3qWdfwv`, frontend bucket `studygrounds-frontend-frontendbucket-5jnigqnmskgt` / CloudFront `E1O78RFI5U6N8S`; PROD uses `studygrounds-prod`, `vhtlpng5e3`, `StudyGroundsProductionDeploy`, `StudyGroundsProdCloudFormationExecutionRole`, Cognito `us-east-2_450eBSuUP`, frontend bucket `studygrounds-prod-frontend-248189942252-us-east-1` / CloudFront `E2JRRP7BOC2CAU`.

Both backends deploy in `us-east-2`; frontend deployment uses `us-east-1`. DEV deliberately does not set `ResourceNamePrefix` to preserve its existing generated resource names, whereas PROD sets `studygrounds-prod`.

The independent backend-only workflows are now inert informational placeholders; do not invoke them for deployment. The previously reviewed manual PROD change set remains unexecuted and must not be separately executed after automatic deployment.

**First-release precautions:** no automated destructive-change review gate exists. Review the PR before merging to main; production environment approvals may gate jobs separately. Backend failures block frontend but can still result in partial rollout/rollback. Frontend changes do not automatically roll back. Verify role secret `AWS_FRONTEND_DEPLOY_ROLE_ARN` is correct for each GitHub environment, monitor the workflows and smoke-test authenticated features.
