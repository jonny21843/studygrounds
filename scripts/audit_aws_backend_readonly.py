"""Read-only StudyGrounds AWS stack/IAM inventory. No resource changes."""
import json
import os
import re
import sys
from pathlib import Path
import boto3
from botocore.exceptions import ClientError

target = os.getenv("STUDY_TARGET", "")
stack_name = os.getenv("STUDY_STACK", "")
account = os.getenv("STUDY_ACCOUNT", "")
report = {
    "target": target, "stackName": stack_name, "account": None,
    "status": None, "stackParameters": {}, "cloudFormationRole": None,
    "resources": {}, "iamRoles": {}, "callerIdentityType": None,
    "relatedIamRoleNames": [], "blockers": [], "warnings": [],
}

def warn(message):
    report["warnings"].append(message)

def block(message):
    report["blockers"].append(message)

def read(label, action, **kwargs):
    try:
        return action(**kwargs)
    except ClientError as e:
        warn(f"{label}: {e.response.get('Error', {}).get('Code', 'AWS error')} — verify read permissions.")
    except Exception as e:
        warn(f"{label}: {type(e).__name__} — verify credentials.")
    return None

def inspect_role(arn, label):
    if not arn:
        warn(f"{label}: no role ARN available.")
        return
    name = arn.split(":assumed-role/", 1)[-1].split("/", 1)[0] if ":assumed-role/" in arn else arn.split("/")[-1]
    iam = boto3.client("iam")
    data = {"name": name, "attachedPolicyArns": [], "inlinePolicyNames": [], "permissionsBoundary": None}
    report["iamRoles"][label] = data
    result = read(f"{label} GetRole", iam.get_role, RoleName=name)
    if result:
        data["permissionsBoundary"] = (result.get("Role") or {}).get("PermissionsBoundary", {}).get("PermissionsBoundaryArn")
    attached = read(f"{label} ListAttachedRolePolicies", iam.list_attached_role_policies, RoleName=name)
    if attached:
        data["attachedPolicyArns"] = [p["PolicyArn"] for p in attached.get("AttachedPolicies", [])]
        if attached.get("IsTruncated"):
            warn(f"{label}: attached policies truncated.")
    inline = read(f"{label} ListRolePolicies", iam.list_role_policies, RoleName=name)
    if inline:
        data["inlinePolicyNames"] = inline.get("PolicyNames", [])
        if inline.get("IsTruncated"):
            warn(f"{label}: inline policies truncated.")
    warn(f"{label}: policy names alone cannot prove deploy permissions; inspect policy documents, boundaries and SCPs.")

def inspect_current_identity(identity):
    arn = identity.get("Arn", "")
    if ":assumed-role/" in arn or ":role/" in arn:
        report["callerIdentityType"] = "role"
        inspect_role(arn, "currentAwsCallerRole")
    elif ":user/" in arn:
        report["callerIdentityType"] = "iam-user"
        report["iamUserName"] = arn.split(":user/", 1)[1].split("/")[-1]
        warn("Current AWS CLI identity is an IAM user, not the GitHub deployment role. Inspect PROD deployment roles separately.")
    elif ":root" in arn:
        report["callerIdentityType"] = "root"
        warn("Current AWS identity is the AWS account root user; use a least-privilege read-only identity for subsequent audits.")
    else:
        report["callerIdentityType"] = "other"
        warn("STS identity format is not a standard IAM user/role; inspect the identity before changing permissions.")

def inspect_related_roles():
    # Inventory names only. Not a permissions evaluation; it cannot prove
    # GitHub OIDC trust, CloudFormation permissions, boundaries or SCPs.
    iam = boto3.client("iam")
    try:
        paginator = iam.get_paginator("list_roles")
        candidates = []
        for page in paginator.paginate():
            for item in page.get("Roles", []):
                name = item.get("RoleName", "")
                if ("studyground" in name.lower() or "notes-app" in name.lower()):
                    candidates.append(name)
        report["relatedIamRoleNames"] = sorted(candidates)
        for name in sorted(candidates):
            # No trust policy or secrets included in report; only policy names.
            inspect_role(f"arn:aws:iam::{account}:role/{name}", f"discovered:{name}")
        if not candidates:
            warn("No StudyGrounds-named IAM roles visible; role names may use a different naming convention.")
    except ClientError as e:
        warn("Cannot list IAM roles (" + e.response.get("Error", {}).get("Code", "AWS error") +
             "). A separate admin or read-only IAM profile may be required.")

if target not in ("development", "production") or not stack_name or not re.fullmatch(r"\d{12}", account):
    block("Provide a target, actual existing backend stack name and 12-digit AWS account ID.")
else:
    identity = read("STS identity", boto3.client("sts").get_caller_identity)
    if not identity:
        block("Could not verify AWS identity.")
    else:
        report["account"] = identity["Account"]
        if report["account"] != account:
            block("Assumed AWS role is in an unexpected account.")
        inspect_current_identity(identity)
        inspect_related_roles()
    cf = boto3.client("cloudformation", region_name="us-east-2")
    result = read("DescribeStacks", cf.describe_stacks, StackName=stack_name)
    stack = next(iter((result or {}).get("Stacks", [])), None)
    if not stack:
        block("Backend stack not visible. Confirm stack name and CloudFormation read access.")
    else:
        report["status"] = stack.get("StackStatus")
        if report["status"] not in ("CREATE_COMPLETE", "UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE"):
            block("CloudFormation stack is not in a stable healthy state.")
        params = {
            p["ParameterKey"]: p.get("ParameterValue")
            for p in stack.get("Parameters", [])
            if p["ParameterKey"] in ("EnvironmentName", "ResourceNamePrefix", "SiteUrl", "CognitoUserPoolId", "CognitoAppClientId")
        }
        report["stackParameters"] = params
        expected_env = "prod" if target == "production" else "dev"
        if params.get("EnvironmentName") != expected_env:
            block(f"Backend EnvironmentName is not {expected_env}. Check the stack selection.")
        if target == "production" and not params.get("ResourceNamePrefix"):
            block("Production stack lacks an explicit resource prefix: verify DEV/PROD isolation.")
        report["cloudFormationRole"] = stack.get("RoleARN")
        if stack.get("RoleARN"):
            inspect_role(stack["RoleARN"], "cloudFormationExecutionRole")
        else:
            warn("Stack has no stored CloudFormation execution RoleARN. This is valid; deployment may use the caller's effective permissions. Verify the actual PROD deployment identity before updating.")
        try:
            pages = cf.get_paginator("list_stack_resources").paginate(StackName=stack_name)
            for page in pages:
                for item in page.get("StackResourceSummaries", []):
                    report["resources"][item["LogicalResourceId"]] = {
                        "type": item["ResourceType"], "status": item["ResourceStatus"],
                    }
        except ClientError as e:
            block("Cannot inventory stack resources: " + e.response.get("Error", {}).get("Code", "AWS error"))
        for name in ("NotesTable", "NotesBucket", "NotesApi", "GuardDutyMalwareProtectionPlan"):
            if name not in report["resources"]:
                block(f"Base infrastructure resource missing from stack: {name}")
        for name in ("SavedNotesTable", "HelpfulVotesTable", "StudyActivityTable",
                     "SavedNotesFunction", "HelpfulVotesFunction", "StudyActivityFunction"):
            if name not in report["resources"]:
                warn(f"Feature resource not present in {target} stack: {name}")

result = "BLOCKED" if report["blockers"] else "REVIEW REQUIRED" if report["warnings"] else "INVENTORY VERIFIED"
report["result"] = result
Path("aws-backend-readiness.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
lines = [
    "# StudyGrounds read-only AWS backend preflight",
    f"Target: **{target}** | Stack: **{stack_name}** | Result: **{result}**",
    f"Account: {report['account'] or 'not verified'} | Stack status: {report['status'] or 'not verified'}",
    "",
    "## Blockers",
    *[f"- {x}" for x in report["blockers"]],
    "", "## Warnings / further IAM checks",
    *[f"- {x}" for x in report["warnings"]],
    "", "No AWS resources were modified. IAM inventory alone is not a deployment permission test.",
]
summary = os.getenv("GITHUB_STEP_SUMMARY")
if summary:
    with open(summary, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
print("\n".join(lines))
sys.exit(1 if report["blockers"] else 0)
