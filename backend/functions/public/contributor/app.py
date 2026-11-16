import hashlib
import json
import os
import re
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr


table = boto3.resource("dynamodb").Table(os.environ["NOTES_TABLE"])
VALID_ID = re.compile(r"^[0-9a-f]{64}$")


def response(code, payload):
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(payload),
    }


def contributor_id(owner_id):
    return hashlib.sha256(
        ("studygrounds:contributor:v1:" + owner_id).encode("utf-8")
    ).hexdigest()


def safe_files(note):
    return [
        source for source in (note.get("files") or [])
        if source.get("malwareScanStatus") in (None, "NO_THREATS_FOUND")
    ]


def note_projection(note):
    return {
        "noteId": note.get("noteId"),
        "title": note.get("title") or "",
        "subject": note.get("subject") or "",
        "collection": note.get("collection") or "",
        "description": note.get("description") or "",
        "publishedAt": note.get("publishedAt"),
        "fileCount": len(safe_files(note)),
        "viewCount": int(note.get("viewCount") or 0),
        "helpfulCount": max(0, int(note.get("helpfulCount") or 0)),
    }


def lambda_handler(event, context):
    target = ((event.get("pathParameters") or {}).get("contributorId") or "").lower()
    if not VALID_ID.fullmatch(target):
        return response(404, {"error": "Contributor not found"})

    matching = []
    scan_args = {
        "FilterExpression": Attr("visibility").eq("public"),
        # Keep response small while retrieving only fields needed for the profile.
        "ProjectionExpression": "userId, noteId, title, subject, #topic, description, publicAuthor, publishedAt, #files, viewCount, helpfulCount, visibility",
        "ExpressionAttributeNames": {"#files": "files", "#topic": "collection"},
    }

    while True:
        result = table.scan(**scan_args)
        for note in result.get("Items", []):
            owner = note.get("userId")
            if not owner or contributor_id(owner) != target or not safe_files(note) or note.get("moderationHold"):
                continue
            matching.append(note)
        if not result.get("LastEvaluatedKey"):
            break
        scan_args["ExclusiveStartKey"] = result["LastEvaluatedKey"]

    if not matching:
        return response(404, {"error": "Contributor not found"})

    matching.sort(key=lambda note: note.get("publishedAt") or "", reverse=True)
    subjects = sorted({
        (note.get("subject") or "").strip() for note in matching
        if (note.get("subject") or "").strip()
    }, key=str.casefold)
    topics = sorted({
        (note.get("collection") or "").strip() for note in matching
        if (note.get("collection") or "").strip()
    }, key=str.casefold)

    params = event.get("queryStringParameters") or {}
    try:
        page = int(params.get("page") or 1)
        if page < 1 or page > 100000:
            raise ValueError()
    except (ValueError, TypeError):
        return response(400, {"error": "Invalid page"})
    page_size = 12
    total = len(matching)
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, total_pages)

    # The public label is stored on published notes, not fetched from Cognito.
    author_label = next(
        (note.get("publicAuthor") for note in matching if note.get("publicAuthor")),
        "Community member",
    )
    return response(200, {
        "contributor": {
            "id": target,
            "displayName": author_label,
            "contributionCount": total,
            "subjects": subjects,
            "topics": topics,
        },
        "notes": [
            note_projection(note)
            for note in matching[(page - 1) * page_size:page * page_size]
        ],
        "page": page,
        "totalPages": total_pages,
    })
