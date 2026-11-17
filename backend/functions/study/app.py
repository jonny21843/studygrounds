"""Per-account study progress and explicit sessions; no document content stored."""
import json
import os
import re
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key

db = boto3.resource("dynamodb")
notes_table = db.Table(os.environ["NOTES_TABLE"])
activity_table = db.Table(os.environ["STUDY_ACTIVITY_TABLE"])
transaction_client = boto3.client("dynamodb")
ACTIVITY_TABLE_NAME = os.environ["STUDY_ACTIVITY_TABLE"]
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
MAX_SESSIONS = 30
MAX_PROGRESS = 100


def response(status, body):
    return {"statusCode": status, "headers": {"Content-Type": "application/json"}, "body": json.dumps(body)}


def user_from_event(event):
    return event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {}).get("sub")


def utc_now():
    return datetime.now(timezone.utc)


def canonical_uuid(value):
    if not isinstance(value, str) or not UUID_RE.fullmatch(value):
        return None
    try:
        return str(uuid.UUID(value))
    except ValueError:
        return None


def body_json(event):
    try:
        result = json.loads(event.get("body") or "{}")
        return result if isinstance(result, dict) else None
    except (ValueError, TypeError):
        return None


def safe_files(note):
    return [
        f for f in (note.get("files") or [])
        if f.get("malwareScanStatus") in (None, "NO_THREATS_FOUND")
    ]


def public_note(note_id, owner_id=None):
    if not owner_id:
        locator = notes_table.query(
            IndexName="NoteIdIndex",
            KeyConditionExpression=Key("noteId").eq(note_id),
            Limit=1,
        ).get("Items") or []
        if not locator or not locator[0].get("userId"):
            return None
        owner_id = locator[0]["userId"]
    note = notes_table.get_item(
        Key={"userId": owner_id, "noteId": note_id}, ConsistentRead=True
    ).get("Item")
    if not note or note.get("visibility") != "public" or note.get("moderationHold") or not safe_files(note):
        return None
    return note


def note_summary(note):
    return {
        "noteId": note["noteId"],
        "title": note.get("title") or "Untitled note",
        "subject": note.get("subject") or "",
        "fileCount": len(safe_files(note)),
    }


def progress_update(user_id, note_id, payload):
    note = public_note(note_id)
    if not note:
        return response(404, {"error": "This note is no longer publicly available."})
    file_id = payload.get("fileId")
    if not isinstance(file_id, str) or not file_id or len(file_id) > 180:
        return response(400, {"error": "Select a source file to remember."})
    if not any(f.get("fileId") == file_id for f in safe_files(note)):
        return response(400, {"error": "This source is no longer available."})

    now = utc_now().isoformat()
    key = {"userId": user_id, "recordKey": f"PROGRESS#{note_id}"}
    activity_table.update_item(
        Key=key,
        UpdateExpression="SET noteId = :note, noteOwnerId = :owner, fileId = :file, lastOpenedAt = :at",
        ExpressionAttributeValues={
            ":note": note_id,
            ":owner": note["userId"],
            ":file": file_id,
            ":at": now,
        },
    )
    return response(200, {"saved": True, "fileId": file_id, "lastOpenedAt": now})


def start_session(user_id, payload):
    note_id = canonical_uuid(payload.get("noteId"))
    if not note_id:
        return response(400, {"error": "Invalid note ID."})
    note = public_note(note_id)
    if not note:
        return response(404, {"error": "This note is no longer publicly available."})
    started_at = utc_now().isoformat()
    session_id = str(uuid.uuid4())
    session_key = f"SESSION#{started_at}#{session_id}"
    try:
        # Reserve the user's one active slot in the same transaction as session creation.
        transaction_client.transact_write_items(TransactItems=[
            {"Put": {
                "TableName": ACTIVITY_TABLE_NAME,
                "Item": {
                    "userId": {"S": user_id}, "recordKey": {"S": "ACTIVE"},
                    "sessionId": {"S": session_id},
                    "sessionKey": {"S": session_key},
                },
                "ConditionExpression": "attribute_not_exists(userId)",
            }},
            {"Put": {
                "TableName": ACTIVITY_TABLE_NAME,
                "Item": {
                    "userId": {"S": user_id}, "recordKey": {"S": session_key},
                    "sessionId": {"S": session_id}, "noteId": {"S": note_id},
                    "noteOwnerId": {"S": note["userId"]},
                    "startedAt": {"S": started_at}, "status": {"S": "active"},
                },
                "ConditionExpression": "attribute_not_exists(userId)",
            }},
        ])
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") == "TransactionCanceledException":
            return response(409, {"error": "Finish your active study session before starting another."})
        raise
    return response(201, {"session": {
        "sessionId": session_id, "noteId": note_id, "startedAt": started_at, "status": "active"
    }})

def finish_session(user_id, session_id, payload):
    # The session's original key is supplied by the API only after validating it.
    started_at = payload.get("startedAt")
    if not isinstance(started_at, str) or len(started_at) > 42:
        return response(400, {"error": "Session start time is required."})
    try:
        parsed = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError()
    except ValueError:
        return response(400, {"error": "Invalid session start time."})
    key = {"userId": user_id, "recordKey": f"SESSION#{started_at}#{session_id}"}
    current = activity_table.get_item(Key=key, ConsistentRead=True).get("Item")
    if not current:
        return response(404, {"error": "Session not found."})
    if current.get("status") == "completed":
        return response(200, {"session": {
            "sessionId": session_id, "status": "completed",
            "minutes": int(current.get("minutes") or 0),
            "endedAt": current.get("endedAt"),
        }})
    if current.get("status") != "active":
        return response(409, {"error": "This session cannot be completed."})
    now = utc_now()
    seconds = max(0, (now - parsed).total_seconds())
    # Avoid overstating study time when someone leaves a tab open overnight.
    minutes = min(240, int(seconds // 60))
    try:
        transaction_client.transact_write_items(TransactItems=[
            {"Update": {
                "TableName": ACTIVITY_TABLE_NAME,
                "Key": {
                    "userId": {"S": user_id},
                    "recordKey": {"S": key["recordKey"]},
                },
                "UpdateExpression": "SET #state = :completed, endedAt = :end, minutes = :minutes",
                "ConditionExpression": "#state = :active",
                "ExpressionAttributeNames": {"#state": "status"},
                "ExpressionAttributeValues": {
                    ":completed": {"S": "completed"}, ":active": {"S": "active"},
                    ":end": {"S": now.isoformat()}, ":minutes": {"N": str(minutes)},
                },
            }},
            {"Delete": {
                "TableName": ACTIVITY_TABLE_NAME,
                "Key": {"userId": {"S": user_id}, "recordKey": {"S": "ACTIVE"}},
                "ConditionExpression": "sessionId = :session",
                "ExpressionAttributeValues": {":session": {"S": session_id}},
            }},
        ])
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") == "TransactionCanceledException":
            return response(409, {"error": "Session has already been updated. Refresh study history."})
        raise
    return response(200, {"session": {
        "sessionId": session_id, "status": "completed",
        "minutes": minutes, "endedAt": now.isoformat(),
    }})


def study_dashboard(user_id):
    progress = activity_table.query(
        KeyConditionExpression=Key("userId").eq(user_id) & Key("recordKey").begins_with("PROGRESS#"),
        Limit=MAX_PROGRESS, ConsistentRead=True,
    ).get("Items") or []
    sessions = activity_table.query(
        KeyConditionExpression=Key("userId").eq(user_id) & Key("recordKey").begins_with("SESSION#"),
        ScanIndexForward=False, Limit=MAX_SESSIONS, ConsistentRead=True,
    ).get("Items") or []
    lookup = {}

    def sanitize(item):
        note_id = item.get("noteId")
        if not canonical_uuid(note_id):
            return None
        if note_id not in lookup:
            lookup[note_id] = public_note(note_id, item.get("noteOwnerId"))
        note = lookup[note_id]
        if not note:
            return {"noteId": note_id, "available": False}
        return {**note_summary(note), "available": True}

    recent = []
    for item in progress:
        summary = sanitize(item)
        if not summary:
            continue
        valid_file = any(f.get("fileId") == item.get("fileId") for f in safe_files(lookup.get(item["noteId"]) or {}))
        recent.append({
            **summary,
            "fileId": item.get("fileId") if summary["available"] and valid_file else None,
            "lastOpenedAt": item.get("lastOpenedAt"),
        })
    recent.sort(key=lambda entry: entry.get("lastOpenedAt") or "", reverse=True)

    # Include an old active session even when it falls outside the latest 30.
    active_marker = activity_table.get_item(
        Key={"userId": user_id, "recordKey": "ACTIVE"}, ConsistentRead=True
    ).get("Item")
    if active_marker and active_marker.get("sessionKey"):
        active_item = activity_table.get_item(
            Key={"userId": user_id, "recordKey": active_marker["sessionKey"]},
            ConsistentRead=True,
        ).get("Item")
        if active_item and all(item.get("sessionId") != active_item.get("sessionId") for item in sessions):
            sessions.insert(0, active_item)

    history = []
    for item in sessions:
        summary = sanitize(item)
        if not summary:
            continue
        history.append({
            **summary, "sessionId": item.get("sessionId"), "startedAt": item.get("startedAt"),
            "endedAt": item.get("endedAt"), "minutes": int(item.get("minutes") or 0),
            "status": item.get("status", "active"),
        })
    return response(200, {"continueStudying": recent[:20], "sessions": history})



MAX_ANNOTATIONS_PER_NOTE = 100
HIGHLIGHT_EXTENSIONS = (".docx", ".pages", ".pptx")
HIGHLIGHT_COLORS = ("yellow", "blue", "green", "pink")


def annotation_file(note, file_id):
    if not isinstance(file_id, str) or not file_id or len(file_id) > 180:
        return None
    return next((f for f in safe_files(note) if f.get("fileId") == file_id), None)


def list_annotations(user_id, note_id):
    note = public_note(note_id)
    if not note:
        return response(404, {"error": "This note is no longer publicly available."})
    prefix = f"ANNOTATION#{note_id}#"
    result = activity_table.query(
        KeyConditionExpression=Key("userId").eq(user_id) & Key("recordKey").begins_with(prefix),
        ConsistentRead=True, Limit=MAX_ANNOTATIONS_PER_NOTE + 1,
    )
    records = result.get("Items") or []
    if result.get("LastEvaluatedKey") or len(records) > MAX_ANNOTATIONS_PER_NOTE:
        return response(409, {"error": "Annotation limit reached. Contact support to review existing annotations."})
    eligible_ids = {f.get("fileId") for f in safe_files(note)}
    output = []
    for item in records:
        if item.get("fileId") not in eligible_ids:
            continue
        record = {
            "id": item.get("annotationId"),
            "fileId": item.get("fileId"),
            "kind": item.get("kind"),
            "text": item.get("text") or "",
            "createdAt": item.get("createdAt"),
        }
        if item.get("kind") == "highlight":
            record["anchor"] = item.get("anchor")
            record["color"] = item.get("color") or "yellow"
        output.append(record)
    output.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
    return response(200, {"annotations": output, "limit": MAX_ANNOTATIONS_PER_NOTE})


def create_annotation(user_id, note_id, payload):
    note = public_note(note_id)
    if not note:
        return response(404, {"error": "This note is no longer publicly available."})
    file_id = payload.get("fileId")
    source = annotation_file(note, file_id)
    if not source:
        return response(400, {"error": "Select an available source file."})
    kind = payload.get("kind")
    if kind not in ("note", "highlight"):
        return response(400, {"error": "Invalid annotation type."})
    content = payload.get("text")
    if not isinstance(content, str):
        return response(400, {"error": "Invalid annotation text."})
    content = content.strip()
    if kind == "note" and (not content or len(content) > 1000):
        return response(400, {"error": "Notes must contain 1–1000 characters."})
    if kind == "highlight" and content:
        return response(400, {"error": "Highlights cannot contain a written note."})

    item = {
        "userId": user_id, "recordKey": "",
        "noteId": note_id, "fileId": file_id, "kind": kind,
        "text": content, "createdAt": utc_now().isoformat(),
        "annotationId": str(uuid.uuid4()),
    }
    if kind == "highlight":
        filename = (source.get("filename") or "").lower()
        if not filename.endswith(HIGHLIGHT_EXTENSIONS):
            return response(400, {"error": "Inline highlighting is supported for Word, Pages and PowerPoint previews."})
        anchor = payload.get("anchor")
        if not isinstance(anchor, dict) or set(anchor) != {"target", "start", "end", "quote"}:
            return response(400, {"error": "Select text from one preview paragraph or slide item."})
        target, start, end, quote = (
            anchor.get("target"), anchor.get("start"), anchor.get("end"), anchor.get("quote")
        )
        if (
            type(target) is not int or target < 0 or target > 10000
            or type(start) is not int or type(end) is not int
            or start < 0 or end <= start or end > 20000
            or not isinstance(quote, str) or len(quote.encode("utf-16-le")) // 2 != end - start
            or not quote.strip() or len(quote) > 500
        ):
            return response(400, {"error": "Invalid highlight selection."})
        color = payload.get("color", "yellow")
        if color not in HIGHLIGHT_COLORS:
            return response(400, {"error": "Unsupported highlight color."})
        item["anchor"] = {"target": target, "start": start, "end": end, "quote": quote}
        item["color"] = color

    prefix = f"ANNOTATION#{note_id}#"
    existing = activity_table.query(
        KeyConditionExpression=Key("userId").eq(user_id) & Key("recordKey").begins_with(prefix),
        Limit=MAX_ANNOTATIONS_PER_NOTE, Select="COUNT",
    )
    if int(existing.get("Count") or 0) >= MAX_ANNOTATIONS_PER_NOTE or existing.get("LastEvaluatedKey"):
        return response(409, {"error": "You have reached the 100-annotation limit for this note."})
    item["recordKey"] = prefix + item["annotationId"]
    activity_table.put_item(
        Item=item,
        ConditionExpression="attribute_not_exists(userId) AND attribute_not_exists(recordKey)",
    )
    output = {
        "id": item["annotationId"], "fileId": file_id,
        "kind": kind, "text": content, "createdAt": item["createdAt"],
    }
    if kind == "highlight":
        output["anchor"] = item["anchor"]
        output["color"] = item["color"]
    return response(201, {"annotation": output})


def delete_annotation(user_id, note_id, annotation_id):
    # Deletion is permitted even when the original public note is unavailable.
    # The userId key prevents deleting another reader's annotation.
    key = {"userId": user_id, "recordKey": f"ANNOTATION#{note_id}#{annotation_id}"}
    activity_table.delete_item(Key=key)
    return response(200, {"deleted": True})


def lambda_handler(event, context):
    user_id = user_from_event(event)
    if not user_id:
        return response(401, {"error": "Sign in to access study history."})
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET").upper()
    path = event.get("rawPath") or ""
    parameters = event.get("pathParameters") or {}

    if "/annotations/" in path:
        note_id = canonical_uuid(parameters.get("noteId"))
        if not note_id:
            return response(400, {"error": "Invalid note ID."})
        annotation_id = parameters.get("annotationId")
        if method == "DELETE" and annotation_id is not None:
            annotation_id = canonical_uuid(annotation_id)
            return delete_annotation(user_id, note_id, annotation_id) if annotation_id else response(400, {"error": "Invalid annotation ID."})
        if annotation_id is None and method == "GET":
            return list_annotations(user_id, note_id)
        if annotation_id is None and method == "POST":
            payload = body_json(event)
            return create_annotation(user_id, note_id, payload) if payload is not None else response(400, {"error": "Invalid request body."})
        return response(405, {"error": "Method not allowed."})

    if method == "GET" and path.rstrip("/").endswith("/api/study"):
        return study_dashboard(user_id)

    if method == "PUT" and "/progress/" in path:
        note_id = canonical_uuid(parameters.get("noteId"))
        if not note_id:
            return response(400, {"error": "Invalid note ID."})
        payload = body_json(event)
        return progress_update(user_id, note_id, payload) if payload is not None else response(400, {"error": "Invalid request body."})

    if method == "POST" and path.rstrip("/").endswith("/sessions"):
        payload = body_json(event)
        return start_session(user_id, payload) if payload is not None else response(400, {"error": "Invalid request body."})

    if method == "PATCH" and "/sessions/" in path:
        session_id = canonical_uuid(parameters.get("sessionId"))
        if not session_id:
            return response(400, {"error": "Invalid session ID."})
        payload = body_json(event)
        return finish_session(user_id, session_id, payload) if payload is not None else response(400, {"error": "Invalid request body."})

    return response(405, {"error": "Method not allowed."})
