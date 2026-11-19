"""Read-only inventory of live DEV retention settings (no resources modified)."""
import argparse
import json
import boto3
from botocore.exceptions import ClientError

def inspect(client_call):
    try:
        return {"value": client_call()}
    except (ClientError, Exception) as exc:
        return {"error": type(exc).__name__ + ": " + str(exc)[:300]}

def audit(stack, region):
    cf = boto3.client("cloudformation", region_name=region)
    logs = boto3.client("logs", region_name=region)
    dynamo = boto3.client("dynamodb", region_name=region)
    s3 = boto3.client("s3", region_name=region)
    resources = []
    for page in cf.get_paginator("list_stack_resources").paginate(StackName=stack):
        resources.extend(page.get("StackResourceSummaries", []))
    report = {"stack": stack, "region": region, "lambdaLogs": {}, "dynamoPitr": {}, "s3Buckets": {}}
    for resource in resources:
        rid = resource.get("PhysicalResourceId")
        rtype = resource.get("ResourceType")
        if not rid:
            continue
        if rtype == "AWS::Lambda::Function":
            name = "/aws/lambda/" + rid
            def get_log_retention():
                groups = logs.describe_log_groups(logGroupNamePrefix=name).get("logGroups", [])
                exact = next((group for group in groups if group.get("logGroupName") == name), None)
                return {"exists": bool(exact), "retentionInDays": exact.get("retentionInDays") if exact else None}
            report["lambdaLogs"][resource["LogicalResourceId"]] = inspect(get_log_retention)
        elif rtype == "AWS::DynamoDB::Table":
            report["dynamoPitr"][resource["LogicalResourceId"]] = inspect(
                lambda rid=rid: dynamo.describe_continuous_backups(TableName=rid).get("ContinuousBackupsDescription", {})
            )
        elif rtype == "AWS::S3::Bucket":
            report["s3Buckets"][resource["LogicalResourceId"]] = {
                "versioning": inspect(lambda rid=rid: s3.get_bucket_versioning(Bucket=rid)),
                "lifecycle": inspect(lambda rid=rid: s3.get_bucket_lifecycle_configuration(Bucket=rid).get("Rules", [])),
            }
    return report

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stack", default="notes-app-dev")
    parser.add_argument("--region", default="us-east-2")
    parser.add_argument("--output", default="retention-report.json")
    args = parser.parse_args()
    report = audit(args.stack, args.region)
    with open(args.output, "w", encoding="utf-8") as output:
        json.dump(report, output, indent=2, default=str)
    print("Created read-only retention inventory at " + args.output)

if __name__ == "__main__":
    main()
