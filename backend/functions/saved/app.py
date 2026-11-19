from legal_guard import require_legal_acceptance
import base64
import json
import os
import re
import uuid
from datetime import datetime, timezone

import boto3
from boto3.dynamodb.conditions import Key


dynamodb = boto3.resource("dynamodb")
notes_table = dynamodb.Table(os.environ["NOTES_TABLE"])
saved_table = dynamodb.Table(os.environ["SAVED_NOTES_TABLE"])
NOTE_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
PAGE_SIZE = 20
MAX_CURSOR_BYTES = 512


def response(code, payload):
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(payload),
    }


def current_user(event):
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
        .get("sub")
    )


def eligible_files(note):
    return [
        item for item in (note.get("files") or [])
        if item.get("malwareScanStatus") in (None, "NO_THREATS_FOUND")
    ]


def eligible_note(note):
    return (
        bool(note)
        and note.get("visibility") == "public"
        and not note.get("moderationHold")
        and bool(eligible_files(note))
    )


def find_public_note(note_id, note_owner_id=None):
    # Read the authoritative base-table record consistently, so a recent
    # moderation removal is not exposed by an eventually consistent GSI.
    if note_owner_id is None:
        result = notes_table.query(
            IndexName="NoteIdIndex",
            KeyConditionExpression=Key("noteId").eq(note_id),
            Limit=1,
        )
        locator = next(iter(result.get("Items") or []), None)
        if not locator or not locator.get("userId"):
            return None
        note_owner_id = locator["userId"]
    result = notes_table.get_item(
        Key={"userId": note_owner_id, "noteId": note_id},
        ConsistentRead=True,
    )
    note = result.get("Item")
    return note if eligible_note(note) else None


def note_projection(note, saved_at, collection=""):
    return {
        "noteId": note["noteId"],
        "title": note.get("title") or "",
        "subject": note.get("subject") or "",
        "collection": note.get("collection") or "",
        "description": note.get("description") or "",
        "publicAuthor": note.get("publicAuthor") or "Community member",
        "publishedAt": note.get("publishedAt"),
        "fileCount": len(eligible_files(note)),
        "viewCount": int(note.get("viewCount") or 0),
        "helpfulCount": max(0, int(note.get("helpfulCount") or 0)),
        "savedAt": saved_at,
        "savedCollection": collection,
        "available": True,
    }


def encode_cursor(key):
    data = json.dumps({"noteId": key["noteId"], "savedKey": key["savedKey"]}, separators=(",", ":"))
    return base64.urlsafe_b64encode(data.encode("utf-8")).decode("ascii").rstrip("=")


def decode_cursor(value, user_id):
    if not value or len(value) > MAX_CURSOR_BYTES:
        raise ValueError("Invalid saved notes cursor")
    try:
        raw = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
        parsed = json.loads(raw)
        if set(parsed) != {"noteId", "savedKey"} or not NOTE_ID.fullmatch(parsed["noteId"]):
            raise ValueError()
        saved_key = parsed["savedKey"]
        if not isinstance(saved_key, str) or len(saved_key) > 128:
            raise ValueError()
        return {"userId": user_id, "noteId": parsed["noteId"], "savedKey": saved_key}
    except (TypeError, ValueError, KeyError, UnicodeDecodeError):
        raise ValueError("Invalid saved notes cursor") from None


def list_saved(user_id, params):
    cursor = (params or {}).get("cursor")
    request = {
        "IndexName": "SavedAtIndex",
        "KeyConditionExpression": Key("userId").eq(user_id),
        "ScanIndexForward": False,
        "Limit": PAGE_SIZE,
    }
    if cursor:
        try:
            request["ExclusiveStartKey"] = decode_cursor(cursor, user_id)
        except ValueError:
            return response(400, {"error": "Invalid saved notes cursor"})

    result = saved_table.query(**request)
    notes = []
    for bookmark in result.get("Items") or []:
        note = find_public_note(bookmark["noteId"], bookmark.get("noteOwnerId"))
        if note:
            notes.append(note_projection(note, bookmark.get("savedAt"), bookmark.get("collection") or ""))
        else:
            # Never return stale title, description, owner or files for removed notes.
            notes.append({
                "noteId": bookmark["noteId"],
                "available": False,
                "savedAt": bookmark.get("savedAt"),
                "savedCollection": bookmark.get("collection") or "",
            })

    last = result.get("LastEvaluatedKey")
    return response(200, {"notes": notes, "nextCursor": encode_cursor(last) if last else None})


def lambda_handler(event, context):
    legal_block = require_legal_acceptance(event)
    if legal_block is not None:
        return legal_block
    user_id = current_user(event)
    if not user_id:
        return response(401, {"error": "Please sign in to manage saved notes."})

    method = (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", "GET")
        .upper()
    )
    note_id = (event.get("pathParameters") or {}).get("noteId")
    if note_id is None:
        if method != "GET":
            return response(405, {"error": "Method not allowed"})
        return list_saved(user_id, event.get("queryStringParameters"))

    if not isinstance(note_id, str) or not NOTE_ID.fullmatch(note_id):
        return response(400, {"error": "Invalid note ID"})
    try:
        note_id = str(uuid.UUID(note_id))
    except ValueError:
        return response(400, {"error": "Invalid note ID"})

    key = {"userId": user_id, "noteId": note_id}
    if method == "GET":
        item = saved_table.get_item(Key=key, ConsistentRead=True).get("Item")
        return response(200, {"saved": bool(item)})

    if method == "DELETE":
        saved_table.delete_item(Key=key)
        return response(200, {"saved": False})

    if method == "PATCH":
        try:
            payload = json.loads(event.get("body") or "{}")
        except (ValueError, TypeError):
            return response(400, {"error": "Invalid collection request"})
        if not isinstance(payload, dict) or not isinstance(payload.get("collection"), str):
            return response(400, {"error": "Collection name is required"})
        name = payload["collection"].strip()
        if len(name) > 60 or any(ord(ch) < 32 for ch in name):
            return response(400, {"error": "Collection name must be 60 characters or fewer"})
        try:
            saved_table.update_item(
                Key=key,
                UpdateExpression="SET #collection = :name",
                ConditionExpression="attribute_exists(userId) AND attribute_exists(noteId)",
                ExpressionAttributeNames={"#collection": "collection"},
                ExpressionAttributeValues={":name": name},
            )
        except Exception as error:
            if getattr(error, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                return response(404, {"error": "Saved note not found"})
            raise
        return response(200, {"collection": name})

    if method != "PUT":
        return response(405, {"error": "Method not allowed"})

    note = find_public_note(note_id)
    if not note:
        return response(404, {"error": "This note is no longer available to save."})

    saved_at = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    try:
        saved_table.put_item(
            Item={
                **key,
                "savedAt": saved_at,
                "savedKey": saved_at + "#" + note_id,
                "noteOwnerId": note["userId"],
            },
            ConditionExpression="attribute_not_exists(userId) AND attribute_not_exists(noteId)",
        )
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
    return response(200, {"saved": True})
