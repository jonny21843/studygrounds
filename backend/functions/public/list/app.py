import json
import hashlib
import math
from datetime import datetime, timezone
from decimal import Decimal
import os
import re
import unicodedata

import boto3
from boto3.dynamodb.conditions import Attr


table = boto3.resource("dynamodb").Table(os.environ["NOTES_TABLE"])


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


def normalize_search(value):
    """Ignore case, accents, punctuation and irregular whitespace for discovery."""
    text = unicodedata.normalize("NFKD", str(value or "").casefold())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return " ".join(re.findall(r"\w+", text, re.UNICODE))


SEARCH_FIELDS = {
    "title": 9,
    "subject": 5,
    "collection": 5,
    "publicAuthor": 4,
    "description": 1,
}


def searchable_text(note):
    return " ".join(normalize_search(note.get(field)) for field in SEARCH_FIELDS)


def relevance_score(note, query):
    """All query words must match; title and exact-phrase matches rank higher."""
    words = normalize_search(query).split()
    if not words:
        return 0
    fields = {field: normalize_search(note.get(field)) for field in SEARCH_FIELDS}
    if not all(any(word in value for value in fields.values()) for word in words):
        return None
    score = 0
    for word in words:
        score += max((weight for field, weight in SEARCH_FIELDS.items() if word in fields[field]), default=0)
        if word in fields["title"].split():
            score += 3
    phrase = " ".join(words)
    if phrase and phrase in fields["title"]:
        score += 24
    elif phrase and any(phrase in fields[field] for field in ("subject", "collection", "publicAuthor")):
        score += 12
    return score




def safe_public_files(note):
    return [
        item for item in (note.get("files") or [])
        if item.get("malwareScanStatus") in (None, "NO_THREATS_FOUND")
    ]


def contributor_id(note):
    owner = note.get("userId")
    if not isinstance(owner, str) or not owner:
        return None
    return hashlib.sha256(("studygrounds:contributor:v1:" + owner).encode("utf-8")).hexdigest()


def public_projection(note):
    safe_files = safe_public_files(note)
    return {
        "noteId": note.get("noteId"),
        "title": note.get("title", ""),
        "subject": note.get("subject", ""),
        "collection": note.get("collection", ""),
        "description": note.get("description", ""),
        "publicAuthor": note.get("publicAuthor", "Community member"),
        "contributorId": contributor_id(note),
        "publishedAt": note.get("publishedAt"),
        "fileCount": len(safe_files),
        "viewCount": int(note.get("viewCount") or 0),
        "helpfulCount": max(0, int(note.get("helpfulCount") or 0)),
    }


def trending_score(note, now=None):
    """Recency-weighted discovery signal, not a measure of recent activity.

    Helpful votes carry more weight than lifetime views; a logarithm prevents
    very high view counts from dominating. Publication age has a 21-day half-life.
    Future timestamps are treated as new, and missing/bad timestamps rank last.
    """
    raw_date = note.get("publishedAt")
    if not raw_date:
        return 0.0
    try:
        published = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
        if published.tzinfo is None:
            published = published.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return 0.0

    now = now or datetime.now(timezone.utc)
    age_days = max(0.0, (now - published).total_seconds() / 86400)
    helpful = max(0, int(note.get("helpfulCount") or 0))
    views = max(0, int(note.get("viewCount") or 0))
    engagement = 1.0 + 5.0 * helpful + 1.5 * math.log1p(views)
    return engagement * (0.5 ** (age_days / 21.0))


def lambda_handler(event, context):
    params = event.get("queryStringParameters") or {}
    query = (params.get("q") or "").strip()[:200]
    subject = (params.get("subject") or "").strip().lower()
    collection = (params.get("collection") or "").strip().lower()
    sort = (params.get("sort") or "newest").strip().lower()
    if sort not in {"newest", "oldest", "title", "views", "helpful", "trending", "relevance"}:
        return response(400, {"error": "Invalid sort"})
    if sort == "relevance" and not normalize_search(query):
        sort = "newest"

    try:
        page = max(1, int(params.get("page") or 1))
        page_size = min(48, max(1, int(params.get("pageSize") or 18)))
    except ValueError:
        return response(400, {"error": "page and pageSize must be numbers"})

    all_public = []
    scan_args = {
        "FilterExpression": Attr("visibility").eq("public"),
    }

    while True:
        result = table.scan(**scan_args)
        all_public.extend(result.get("Items", []))

        last_key = result.get("LastEvaluatedKey")
        if not last_key:
            break

        scan_args["ExclusiveStartKey"] = last_key

    all_public = [
        note for note in all_public
        if note.get("visibility") == "public" and safe_public_files(note) and not note.get("moderationHold")
    ]

    subjects = sorted(
        {
            (note.get("subject") or "").strip()
            for note in all_public
            if (note.get("subject") or "").strip()
        },
        key=str.lower,
    )
    collections = sorted(
        {
            (note.get("collection") or "").strip()
            for note in all_public
            if (note.get("collection") or "").strip()
        },
        key=str.lower,
    )

    subject_topics = {}
    for note in all_public:
        subject_value = (note.get("subject") or "").strip()
        topic_value = (note.get("collection") or "").strip()
        if not subject_value or not topic_value:
            continue
        subject_topics.setdefault(subject_value, set()).add(topic_value)

    subject_topics = {
        subject_value: sorted(values, key=str.lower)
        for subject_value, values in subject_topics.items()
    }

    notes = all_public

    if query:
        notes = [note for note in notes if relevance_score(note, query) is not None]

    if subject:
        notes = [
            note
            for note in notes
            if (note.get("subject") or "").strip().lower() == subject
        ]

    if collection:
        notes = [
            note
            for note in notes
            if (note.get("collection") or "").strip().lower() == collection
        ]

    if sort == "relevance":
        notes.sort(
            key=lambda note: (
                relevance_score(note, query),
                max(0, int(note.get("helpfulCount") or 0)),
                note.get("publishedAt") or "",
                note.get("noteId") or "",
            ),
            reverse=True,
        )
    elif sort == "oldest":
        notes.sort(key=lambda note: note.get("publishedAt", ""))
    elif sort == "title":
        notes.sort(key=lambda note: (note.get("title") or "").lower())
    elif sort == "views":
        notes.sort(key=lambda note: (int(note.get("viewCount") or 0), note.get("publishedAt") or ""), reverse=True)
    elif sort == "helpful":
        notes.sort(key=lambda note: (max(0, int(note.get("helpfulCount") or 0)), note.get("publishedAt") or "", note.get("noteId") or ""), reverse=True)
    elif sort == "trending":
        now = datetime.now(timezone.utc)
        notes.sort(
            key=lambda note: (
                trending_score(note, now),
                note.get("publishedAt") or "",
                note.get("noteId") or "",
            ),
            reverse=True,
        )
    else:
        notes.sort(key=lambda note: note.get("publishedAt", ""), reverse=True)

    total = len(notes)
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    page = min(page, total_pages)
    start = (page - 1) * page_size
    page_notes = notes[start : start + page_size]

    return response(
        200,
        {
            "notes": [public_projection(note) for note in page_notes],
            "subjects": subjects,
            "collections": collections,
            "subjectTopics": subject_topics,
            "page": page,
            "pageSize": page_size,
            "total": total,
            "totalPages": total_pages,
        },
    )
