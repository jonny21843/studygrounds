import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key


dynamodb = boto3.resource("dynamodb")
notes_table = dynamodb.Table(os.environ["NOTES_TABLE"])
reports_table = dynamodb.Table(os.environ["REPORTS_TABLE"])
admin_emails = {
    item.strip().lower()
    for item in os.environ.get("ADMIN_EMAILS", "").split(",")
    if item.strip()
}


def json_default(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=json_default),
    }


def claims(event):
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )


def admin_email(event):
    value = (claims(event).get("email") or "").strip().lower()
    return value if value in admin_emails else None


def require_admin(event):
    email = admin_email(event)
    if not email:
        return None, response(403, {"error": "Admin access required."})
    return email, None


def scan_reports():
    reports = []
    args = {}
    while True:
        result = reports_table.scan(**args)
        reports.extend(result.get("Items") or [])
        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break
        args["ExclusiveStartKey"] = last_key

    reports.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
    return reports


def get_note(note_id):
    result = notes_table.query(
        IndexName="NoteIdIndex",
        KeyConditionExpression=Key("noteId").eq(note_id),
        Limit=1,
    )
    items = result.get("Items") or []
    return items[0] if items else None


def list_moderation():
    reports = scan_reports()
    open_reports = [item for item in reports if item.get("status") == "OPEN"]
    return {
        "metrics": {
            "open": len(open_reports),
            "dismissed": sum(1 for item in reports if item.get("status") == "DISMISSED"),
            "actioned": sum(1 for item in reports if item.get("status") == "ACTIONED"),
            "total": len(reports),
        },
        "reports": reports[:200],
    }


def update_report(report_id, status, admin, action):
    now = datetime.now(timezone.utc).isoformat()
    reports_table.update_item(
        Key={"reportId": report_id},
        UpdateExpression=(
            "SET #status = :status, updatedAt = :updated_at, "
            "reviewedAt = :reviewed_at, reviewedBy = :reviewed_by, "
            "adminAction = :admin_action"
        ),
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={
            ":status": status,
            ":updated_at": now,
            ":reviewed_at": now,
            ":reviewed_by": admin,
            ":admin_action": action,
        },
        ConditionExpression="attribute_exists(reportId)",
    )


def unpublish_note(note_id, admin):
    note = get_note(note_id)
    if not note:
        raise ValueError("Reported note no longer exists.")

    now = datetime.now(timezone.utc).isoformat()
    notes_table.update_item(
        Key={"userId": note["userId"], "noteId": note["noteId"]},
        UpdateExpression=(
            "SET visibility = :private, moderatedAt = :moderated_at, "
            "moderatedBy = :moderated_by, moderationReason = :reason "
            "REMOVE publishedAt"
        ),
        ExpressionAttributeValues={
            ":private": "private",
            ":moderated_at": now,
            ":moderated_by": admin,
            ":reason": "Reported content removed by moderation",
        },
    )


def handle_action(event, report_id):
    admin, error = require_admin(event)
    if error:
        return error

    try:
        payload = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Request body must be valid JSON."})

    action = str(payload.get("action") or "").strip().lower()
    report = reports_table.get_item(Key={"reportId": report_id}).get("Item")
    if not report:
        return response(404, {"error": "Report not found."})

    try:
        if action == "dismiss":
            update_report(report_id, "DISMISSED", admin, action)
        elif action == "unpublish":
            unpublish_note(report.get("noteId"), admin)
            update_report(report_id, "ACTIONED", admin, action)
        else:
            return response(400, {"error": "Unsupported moderation action."})
    except ValueError as exc:
        return response(400, {"error": str(exc)})

    return response(200, {"ok": True, "action": action})


def lambda_handler(event, context):
    admin, error = require_admin(event)
    if error:
        return error

    method = (event.get("requestContext", {}).get("http", {}).get("method") or "").upper()
    report_id = ((event.get("pathParameters") or {}).get("reportId") or "").strip()

    if method == "GET":
        return response(200, list_moderation())
    if method == "PATCH" and report_id:
        return handle_action(event, report_id)

    return response(404, {"error": "Not found."})
