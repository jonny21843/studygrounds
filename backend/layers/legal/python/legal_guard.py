"""Shared legal acknowledgement gate for authenticated write operations."""
import json
import os
import boto3

def require_legal_acceptance(event):
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method", "GET").upper()
    if method not in ("POST", "PUT", "PATCH", "DELETE"):
        return None
    claims = (((event.get("requestContext") or {}).get("authorizer") or {}).get("jwt") or {}).get("claims") or {}
    user_id = claims.get("sub")
    if not user_id:
        return {"statusCode": 401, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "Authentication required"})}
    table = boto3.resource("dynamodb").Table(os.environ["LEGAL_PREFERENCES_TABLE"])
    for name, version in (("terms", os.environ["LEGAL_TERMS_VERSION"]), ("privacy", os.environ["LEGAL_PRIVACY_VERSION"])):
        key = {"pk": "USER#" + user_id, "sk": "LEGAL#" + name + "#" + version}
        record = table.get_item(Key=key, ConsistentRead=True).get("Item")
        if not record:
            return {"statusCode": 428, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "Legal acceptance required", "code": "LEGAL_ACCEPTANCE_REQUIRED"})}
    return None
