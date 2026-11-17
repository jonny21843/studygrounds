"""Read-only StudyGrounds deployment-role policy inventory.

Usage:
  python scripts/compare_deployment_iam_readonly.py

Only IAM Get/List APIs are used. No AWS changes, trust changes, simulation,
credential material, or IAM policy versions are created.
"""
import json
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

ROLE_NAMES = [
    "StudyGroundsProductionDeploy",
    "StudyGroundsFrontendDeploy",
    "StudyGroundsDevDeploy",
    "StudyGroundsDevCloudFormationExecutionRole",
]
iam = boto3.client("iam")
sts = boto3.client("sts")
result = {"caller": {}, "roles": {}, "warnings": []}


def collect_statements(document):
    doc = document if isinstance(document, dict) else json.loads(document)
    statements = doc.get("Statement", [])
    if isinstance(statements, dict):
        statements = [statements]
    lines = []
    for statement in statements:
        actions = statement.get("Action", statement.get("NotAction", []))
        if isinstance(actions, str):
            actions = [actions]
        resources = statement.get("Resource", statement.get("NotResource", []))
        if isinstance(resources, str):
            resources = [resources]
        lines.append({
            "effect": statement.get("Effect", ""),
            "actionType": "NotAction" if "NotAction" in statement else "Action",
            "actions": sorted(actions),
            "resourcePatterns": resources,
            "hasConditions": bool(statement.get("Condition")),
        })
    return lines


def aws_read(label, call, **kwargs):
    try:
        return call(**kwargs)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "AWS error")
        result["warnings"].append(f"{label}: {code} (insufficient read access or missing resource)")
        return None


def trust_summary(role):
    trust = role.get("AssumeRolePolicyDocument") or {}
    statements = trust.get("Statement") or []
    if isinstance(statements, dict):
        statements = [statements]
    summary = []
    for statement in statements:
        principal = statement.get("Principal") or {}
        summary.append({
            "effect": statement.get("Effect"),
            "principal": principal,
            "actions": statement.get("Action"),
            "conditions": statement.get("Condition", {}),
        })
    return summary


identity = aws_read("sts:GetCallerIdentity", sts.get_caller_identity)
if identity:
    result["caller"] = {
        "account": identity.get("Account"), "arn": identity.get("Arn"),
    }

for role_name in ROLE_NAMES:
    record = {
        "exists": False, "trust": [], "permissionsBoundary": None,
        "attached": [], "inline": [],
    }
    result["roles"][role_name] = record
    role_info = aws_read(role_name + " GetRole", iam.get_role, RoleName=role_name)
    if not role_info:
        continue
    role = role_info["Role"]
    record["exists"] = True
    record["trust"] = trust_summary(role)
    record["permissionsBoundary"] = (
        role.get("PermissionsBoundary") or {}
    ).get("PermissionsBoundaryArn")

    attached = aws_read(
        role_name + " ListAttachedRolePolicies",
        iam.get_paginator("list_attached_role_policies").paginate,
        RoleName=role_name,
    )
    if attached is not None:
        try:
            for page in attached:
                for policy in page.get("AttachedPolicies", []):
                    policy_arn = policy["PolicyArn"]
                    policy_info = aws_read(
                        role_name + " GetPolicy " + policy_arn,
                        iam.get_policy,
                        PolicyArn=policy_arn,
                    )
                    if not policy_info:
                        continue
                    version = (policy_info["Policy"].get("DefaultVersionId"))
                    policy_version = aws_read(
                        role_name + " GetPolicyVersion " + policy_arn,
                        iam.get_policy_version,
                        PolicyArn=policy_arn, VersionId=version,
                    )
                    record["attached"].append({
                        "policyName": policy.get("PolicyName"),
                        "policyArn": policy_arn,
                        "statements": collect_statements(policy_version["PolicyVersion"]["Document"])
                        if policy_version else [],
                    })
        except ClientError as exc:
            result["warnings"].append(
                role_name + " attached policy pagination: " +
                exc.response.get("Error", {}).get("Code", "AWS error")
            )

    inline = aws_read(
        role_name + " ListRolePolicies",
        iam.get_paginator("list_role_policies").paginate,
        RoleName=role_name,
    )
    if inline is not None:
        try:
            for page in inline:
                for name in page.get("PolicyNames", []):
                    policy = aws_read(
                        role_name + " GetRolePolicy " + name,
                        iam.get_role_policy,
                        RoleName=role_name, PolicyName=name,
                    )
                    record["inline"].append({
                        "policyName": name,
                        "statements": collect_statements(policy["PolicyDocument"])
                        if policy else [],
                    })
        except ClientError as exc:
            result["warnings"].append(
                role_name + " inline policy pagination: " +
                exc.response.get("Error", {}).get("Code", "AWS error")
            )

Path("deployment-iam-readonly.json").write_text(
    json.dumps(result, indent=2, default=str), encoding="utf-8"
)

print("# StudyGrounds IAM deployment role review (READ ONLY)")
print("AWS account:", result["caller"].get("account", "unverified"))
for name, details in result["roles"].items():
    print("\nROLE:", name)
    if not details["exists"]:
        print("  Not verified / missing.")
        continue
    print("  Trust principals:", [s.get("principal") for s in details["trust"]])
    print("  Trust conditions:", [s.get("conditions") for s in details["trust"]])
    print("  Permissions boundary:", details["permissionsBoundary"] or "none visible")
    for policy in details["attached"] + details["inline"]:
        print("  POLICY:", policy["policyName"])
        for statement in policy["statements"]:
            actions = ", ".join(statement["actions"])
            print("    ", statement["effect"], statement["actionType"], actions)
            print("     Resource patterns:", statement["resourcePatterns"])
            if statement["hasConditions"]:
                print("     Conditional statement: YES (inspect original policy)")
for warning in result["warnings"]:
    print("WARNING:", warning)
print("\nReport saved to deployment-iam-readonly.json")
print("This is not an effective-permissions simulation. Check SCPs and explicit denies.")
