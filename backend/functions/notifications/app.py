"""Private in-app notifications stored in the existing per-user preferences table."""
import json
import os
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key

table = boto3.resource("dynamodb").Table(os.environ["PREFERENCES_TABLE"])
MAX_NOTICES = 500


def reply(status, body):
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}


def identity(event):
    return (event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {}).get("sub"))


def read_notices(user_id):
    items = []
    args = {
        "KeyConditionExpression": Key("pk").eq("USER#" + user_id) & Key("sk").begins_with("NOTICE#"),
        "ConsistentRead": True,
        "Limit": 100,
    }
    # Bound the inbox in V1; events are deduplicated by their stable event key.
    while len(items) < MAX_NOTICES:
        result = table.query(**args)
        items.extend(result.get("Items") or [])
        if not result.get("LastEvaluatedKey"):
            break
        args["ExclusiveStartKey"] = result["LastEvaluatedKey"]
    items = items[:MAX_NOTICES]
    items.sort(key=lambda x: (x.get("createdAt") or "", x.get("sk") or ""), reverse=True)
    return items


def render(notice):
    return {
        "id": notice["sk"].removeprefix("NOTICE#"),
        "type": notice.get("type") if notice.get("type") in ("helpful", "moderation", "restored") else "update",
        "message": notice.get("message") or "",
        "createdAt": notice.get("createdAt") or "",
        "read": bool(notice.get("read", False)),
        "noteId": notice.get("noteId") or None,
    }


def lambda_handler(event, context):
    user_id = identity(event)
    if not user_id:
        return reply(401, {"error": "Sign in to view notifications."})
    method = (event.get("requestContext", {}).get("http", {}).get("method") or "GET").upper()
    if method == "GET":
        items = read_notices(user_id)
        return reply(200, {
            "notifications": [render(n) for n in items[:25]],
            "unreadCount": sum(not bool(n.get("read", False)) for n in items),
            "limited": len(items) >= MAX_NOTICES,
        })
    if method != "PATCH":
        return reply(405, {"error": "Method not allowed"})
    try:
        body = json.loads(event.get("body") or "{}")
    except (TypeError, ValueError):
        return reply(400, {"error": "Invalid JSON"})
    if not isinstance(body, dict):
        return reply(400, {"error": "Invalid request"})
    if body.get("all") is True:
        # Bound writes: only notifications currently in the recent inbox are marked.
        for notice in read_notices(user_id)[:25]:
            if not notice.get("read", False):
                table.update_item(
                    Key={"pk": "USER#" + user_id, "sk": notice["sk"]},
                    UpdateExpression="SET #read = :true",
                    ConditionExpression="attribute_exists(pk)",
                    ExpressionAttributeNames={"#read": "read"},
                    ExpressionAttributeValues={":true": True},
                )
        return reply(200, {"ok": True})
    notification_id = body.get("id")
    if not isinstance(notification_id, str) or not notification_id or len(notification_id) > 230 or not notification_id.startswith(("HELPFUL#", "MODERATION#")):
        return reply(400, {"error": "Invalid notification"})
    try:
        table.update_item(
            Key={"pk": "USER#" + user_id, "sk": "NOTICE#" + notification_id},
            UpdateExpression="SET #read = :true",
            ConditionExpression="attribute_exists(pk)",
            ExpressionAttributeNames={"#read": "read"},
            ExpressionAttributeValues={":true": True},
        )
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return reply(404, {"error": "Notification not found"})
        raise
    return reply(200, {"ok": True})
