from legal_guard import require_legal_acceptance
import hashlib
import json
import os
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key


dynamodb = boto3.resource("dynamodb")
notes_table = dynamodb.Table(os.environ["NOTES_TABLE"])
reports_table = dynamodb.Table(os.environ["REPORTS_TABLE"])
quota_table = dynamodb.Table(os.environ.get("PREFERENCES_TABLE", "studygrounds-quota-test"))

ALLOWED_REASONS = {
    "spam",
    "inappropriate",
    "copyright",
    "misleading",
    "other",
}


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def claims(event):
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )


def public_note(note_id):
    result = notes_table.query(
        IndexName="NoteIdIndex",
        KeyConditionExpression=Key("noteId").eq(note_id),
        Limit=1,
    )
    items = result.get("Items") or []
    note = items[0] if items else None
    if not note or note.get("visibility") != "public":
        return None
    return note


def report_id_for(note_id, reporter_id):
    raw = f"{note_id}|{reporter_id}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()



def reserve_daily_action(user_id, action, limit):
    """UTC-day per-account counter; DynamoDB conditional updates are atomic."""
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        quota_table.update_item(
            Key={"pk": "USER#" + user_id, "sk": "QUOTA#" + day + "#" + action},
            UpdateExpression="ADD #used :one SET expiresAt = :expires",
            ConditionExpression="attribute_not_exists(#used) OR #used < :limit",
            ExpressionAttributeNames={"#used": "used"},
            ExpressionAttributeValues={":one": 1, ":limit": limit, ":expires": int(midnight.timestamp()) + 3 * 86400},
        )
        return True
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise

def lambda_handler(event, context):
    legal_block = require_legal_acceptance(event)
    if legal_block is not None:
        return legal_block
    note_id = ((event.get("pathParameters") or {}).get("noteId") or "").strip()
    if not note_id:
        return response(400, {"error": "Note ID is required."})

    user_claims = claims(event)
    reporter_id = (user_claims.get("sub") or "").strip()
    reporter_email = (user_claims.get("email") or "").strip().lower()
    if not reporter_id:
        return response(401, {"error": "Sign in to report a note."})

    note = public_note(note_id)
    if not note:
        return response(404, {"error": "Public note not found."})

    if reporter_id == str(note.get("userId") or ""):
        return response(400, {"error": "You cannot report your own note."})

    report_id = report_id_for(note_id, reporter_id)
    method = (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", "POST")
        .upper()
    )

    if method == "GET":
        existing = reports_table.get_item(Key={"reportId": report_id}).get("Item")
        return response(
            200,
            {
                "reported": bool(existing),
                "report": (
                    {
                        "reportId": existing.get("reportId"),
                        "status": existing.get("status") or "OPEN",
                        "createdAt": existing.get("createdAt"),
                    }
                    if existing
                    else None
                ),
            },
        )

    try:
        payload = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Request body must be valid JSON."})

    reason = str(payload.get("reason") or "").strip().lower()
    details = str(payload.get("details") or "").strip()

    if reason not in ALLOWED_REASONS:
        return response(400, {"error": "Choose a valid report reason."})
    if len(details) > 1000:
        return response(400, {"error": "Report details must be 1000 characters or fewer."})

    if reports_table.get_item(Key={"reportId": report_id}).get("Item"):
        return response(409, {"error": "You already reported this note.", "reported": True, "report": {"reportId": report_id}})

    if not reserve_daily_action(reporter_id, "report", int(os.environ.get("MAX_DAILY_REPORTS", "10"))):
        return response(429, {"error": "Daily reporting limit reached. Try again tomorrow (UTC).", "code": "DAILY_REPORT_LIMIT"})

    now = datetime.now(timezone.utc).isoformat()

    try:
        reports_table.put_item(
            Item={
            "reportId": report_id,
            "noteId": note_id,
            "noteOwnerId": note.get("userId"),
            "noteTitle": note.get("title") or "Untitled note",
            "reporterId": reporter_id,
            "reporterEmail": reporter_email or None,
            "reason": reason,
            "details": details,
            "status": "OPEN",
            "createdAt": now,
                "updatedAt": now,
            },
            ConditionExpression="attribute_not_exists(reportId)",
        )
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return response(
                409,
                {
                    "error": "You already reported this note.",
                    "reported": True,
                    "report": {"reportId": report_id},
                },
            )
        raise

    return response(
        200,
        {
            "report": {
                "reportId": report_id,
                "status": "OPEN",
            },
            "message": "Thanks. This note has been sent to StudyGrounds moderation.",
        },
    )
