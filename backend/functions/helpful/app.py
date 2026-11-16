import json
import os
import re
import uuid

import boto3
from boto3.dynamodb.conditions import Key


dynamodb = boto3.resource("dynamodb")
notes = dynamodb.Table(os.environ["NOTES_TABLE"])
votes = dynamodb.Table(os.environ["HELPFUL_VOTES_TABLE"])
client = boto3.client("dynamodb")
NOTES_NAME = os.environ["NOTES_TABLE"]
VOTES_NAME = os.environ["HELPFUL_VOTES_TABLE"]
NOTE_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def response(code, body):
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def user_id(event):
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
        .get("sub")
    )


def locate_note(note_id):
    match = notes.query(
        IndexName="NoteIdIndex",
        KeyConditionExpression=Key("noteId").eq(note_id),
        Limit=1,
    ).get("Items") or []
    if not match or not match[0].get("userId"):
        return None
    # A consistent base-table read prevents stale GSI moderation state.
    return notes.get_item(
        Key={"userId": match[0]["userId"], "noteId": note_id},
        ConsistentRead=True,
    ).get("Item")


def is_public(note):
    return (
        note is not None
        and note.get("visibility") == "public"
        and not note.get("moderationHold")
        and any(
            item.get("malwareScanStatus") in (None, "NO_THREATS_FOUND")
            for item in (note.get("files") or [])
        )
    )


def vote_status(note, voter):
    vote = votes.get_item(
        Key={"userId": voter, "noteId": note["noteId"]},
        ConsistentRead=True,
    ).get("Item")
    return {
        "helpful": bool(vote),
        "helpfulCount": max(0, int(note.get("helpfulCount") or 0)),
    }


def transact(note, voter, add):
    note_key = {
        "userId": {"S": note["userId"]},
        "noteId": {"S": note["noteId"]},
    }
    vote_key = {
        "userId": {"S": voter},
        "noteId": {"S": note["noteId"]},
    }
    operation = {
        "Put": {
            "TableName": VOTES_NAME,
            "Item": {**vote_key},
            "ConditionExpression": "attribute_not_exists(userId)",
        }
    } if add else {
        "Delete": {
            "TableName": VOTES_NAME,
            "Key": vote_key,
            "ConditionExpression": "attribute_exists(userId)",
        }
    }
    condition = "attribute_exists(userId) AND #v = :public AND (attribute_not_exists(moderationHold) OR moderationHold = :false)" if add else "attribute_exists(userId) AND (attribute_not_exists(helpfulCount) OR helpfulCount >= :one)"
    update = {
        "Update": {
            "TableName": NOTES_NAME,
            "Key": note_key,
            "UpdateExpression": "ADD helpfulCount :delta",
            "ConditionExpression": condition,
            "ExpressionAttributeNames": {"#v": "visibility"} if add else {},
            "ExpressionAttributeValues": {
                ":delta": {"N": "1" if add else "-1"},
                **({":public": {"S": "public"}, ":false": {"BOOL": False}} if add else {":one": {"N": "1"}}),
            },
        }
    }
    client.transact_write_items(TransactItems=[operation, update])


def lambda_handler(event, context):
    voter = user_id(event)
    if not voter:
        return response(401, {"error": "Sign in to mark notes helpful."})

    raw_id = (event.get("pathParameters") or {}).get("noteId") or ""
    if not NOTE_ID.fullmatch(raw_id):
        return response(400, {"error": "Invalid note ID"})
    note_id = str(uuid.UUID(raw_id))
    method = (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", "GET")
        .upper()
    )
    if method not in {"GET", "PUT", "DELETE"}:
        return response(405, {"error": "Method not allowed"})

    note = locate_note(note_id)
    if not note or not is_public(note):
        return response(404, {"error": "Public note unavailable."})
    if method == "PUT" and note["userId"] == voter:
        return response(403, {"error": "You cannot mark your own note helpful."})

    current = vote_status(note, voter)
    if method == "GET" or current["helpful"] == (method == "PUT"):
        return response(200, current)

    try:
        transact(note, voter, method == "PUT")
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") not in (
            "TransactionCanceledException", "ConditionalCheckFailedException"
        ):
            raise
        latest = locate_note(note_id)
        if not is_public(latest):
            return response(404, {"error": "Public note unavailable."})
        fresh = vote_status(latest, voter)
        if fresh["helpful"] == (method == "PUT"):
            return response(200, fresh)
        return response(409, {"error": "Could not update your vote. Please try again."})

    latest = locate_note(note_id)
    if not is_public(latest):
        return response(404, {"error": "Public note unavailable."})
    return response(200, vote_status(latest, voter))
