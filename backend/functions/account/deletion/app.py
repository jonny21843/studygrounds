"""Request account deletion; authenticated identity is the only deletion target."""
import json
import os
import uuid
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError

dynamo = boto3.resource("dynamodb")
prefs = dynamo.Table(os.environ["PREFERENCES_TABLE"])
queue = boto3.client("sqs")
QUEUE_URL = os.environ["DELETION_QUEUE_URL"]
MARKER = "ACCOUNT#DELETION"

def reply(code, body):
    return {"statusCode": code, "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"}, "body": json.dumps(body)}

def identity(event):
    return ((((event.get("requestContext") or {}).get("authorizer") or {}).get("jwt") or {}).get("claims") or {})

def lambda_handler(event, context):
    claims = identity(event)
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        return reply(401, {"error": "Authentication is required."})
    username = claims.get("username") or claims.get("cognito:username")
    if not username:
        return reply(403, {"error": "Cannot verify account identity for deletion."})
    method = (((event.get("requestContext") or {}).get("http") or {}).get("method") or "GET").upper()
    key = {"pk": "USER#" + sub, "sk": MARKER}
    existing = prefs.get_item(Key=key, ConsistentRead=True).get("Item")
    if method == "GET":
        return reply(200, {"requested": bool(existing), "status": existing.get("status") if existing else None})
    if method != "POST":
        return reply(405, {"error": "Method not allowed."})
    try:
        payload = json.loads(event.get("body") or "{}")
    except (ValueError, TypeError):
        return reply(400, {"error": "Invalid JSON."})
    if not isinstance(payload, dict) or payload != {"confirmation": "DELETE MY ACCOUNT"}:
        return reply(400, {"error": "Type DELETE MY ACCOUNT to confirm permanent deletion."})
    if existing:
        return reply(202, {"requested": True, "status": existing.get("status", "PENDING")})
    request_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    try:
        prefs.put_item(Item={
            **key, "requestId": request_id, "username": username,
            "requestedAt": now, "status": "PENDING",
        }, ConditionExpression="attribute_not_exists(pk) AND attribute_not_exists(sk)")
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return reply(202, {"requested": True, "status": "PENDING"})
        raise
    try:
        queue.send_message(QueueUrl=QUEUE_URL, MessageBody=json.dumps({"sub": sub, "requestId": request_id}))
    except Exception:
        # Do not strand an account in a permanently blocked state if enqueue fails.
        prefs.delete_item(Key=key, ConditionExpression="requestId = :id", ExpressionAttributeValues={":id": request_id})
        return reply(503, {"error": "Deletion could not be queued. Please retry."})
    return reply(202, {"requested": True, "status": "PENDING", "message": "Your account deletion has been requested. Sign out now."})
