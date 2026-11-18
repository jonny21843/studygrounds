"""Authenticated feedback submissions and admin triage."""
import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from botocore.exceptions import ClientError

table = boto3.resource("dynamodb").Table(os.environ["FEEDBACK_TABLE"])
ADMIN_EMAILS = {x.strip().lower() for x in os.environ.get("ADMIN_EMAILS", "").split(",") if x.strip()}
CATEGORIES = {"bug", "feature", "general", "usability"}
STATUSES = {"NEW", "IN_REVIEW", "RESOLVED"}
COOLDOWN_SECONDS = 120
MAX_BODY_BYTES = 6000

def respond(code, value):
    return {"statusCode": code, "headers": {"Content-Type": "application/json"}, "body": json.dumps(value)}

def claims(event):
    return (((event.get("requestContext") or {}).get("authorizer") or {}).get("jwt") or {}).get("claims") or {}

def administrator(event):
    c = claims(event)
    email = str(c.get("email") or "").strip().lower()
    username = str(c.get("username") or c.get("cognito:username") or "").strip().lower()
    return email if email in ADMIN_EMAILS else username if username in ADMIN_EMAILS else None

def parse_body(event):
    body = event.get("body") or "{}"
    if len(body.encode("utf-8")) > MAX_BODY_BYTES:
        return None
    try:
        value = json.loads(body)
    except (ValueError, TypeError):
        return None
    return value if isinstance(value, dict) else None

def validation(payload):
    category = payload.get("category")
    subject = payload.get("subject")
    details = payload.get("details")
    context = payload.get("context", "")
    if not isinstance(category, str) or category not in CATEGORIES:
        return "Choose a valid feedback category."
    if not isinstance(subject, str) or not 3 <= len(subject.strip()) <= 120:
        return "Subject must be 3–120 characters."
    if not isinstance(details, str) or not 10 <= len(details.strip()) <= 2000:
        return "Details must be 10–2000 characters."
    if not isinstance(context, str) or len(context) > 250:
        return "Context must be 250 characters or fewer."
    return None

def submit(event):
    c = claims(event)
    sub = str(c.get("sub") or "")
    if not sub:
        return respond(401, {"error": "Sign in to send feedback."})
    data = parse_body(event)
    if data is None:
        return respond(400, {"error": "Invalid or oversized feedback."})
    problem = validation(data)
    if problem:
        return respond(400, {"error": problem})
    now = datetime.now(timezone.utc)
    seconds = int(now.timestamp())
    # Atomic per-account cooldown. A rejected write does not create feedback.
    try:
        table.update_item(
            Key={"feedbackId": "LIMIT#" + sub},
            UpdateExpression="SET nextAllowedAt = :next",
            ConditionExpression="attribute_not_exists(nextAllowedAt) OR nextAllowedAt <= :now",
            ExpressionAttributeValues={":next": seconds + COOLDOWN_SECONDS, ":now": seconds},
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return respond(429, {"error": "Please wait two minutes before submitting more feedback."})
        raise
    feedback_id = str(uuid.uuid4())
    item = {
        "feedbackId": feedback_id,
        "userId": sub,
        "email": str(c.get("email") or "").strip().lower(),
        "category": data["category"],
        "subject": data["subject"].strip(),
        "details": data["details"].strip(),
        "context": data.get("context", "").strip(),
        "status": "NEW",
        "createdAt": now.isoformat(),
        "updatedAt": now.isoformat(),
    }
    table.put_item(Item=item, ConditionExpression="attribute_not_exists(feedbackId)")
    return respond(201, {"feedbackId": feedback_id, "message": "Thanks for helping improve StudyGrounds!"})

def list_feedback(event):
    status = ((event.get("queryStringParameters") or {}).get("status") or "").strip().upper()
    if status and status not in STATUSES:
        return respond(400, {"error": "Invalid status filter."})
    # Pagination to avoid unbounded scans or Lambda response size.
    params = {"Limit": 100}
    token = (event.get("queryStringParameters") or {}).get("cursor")
    if token:
        try:
            from base64 import urlsafe_b64decode
            key = json.loads(urlsafe_b64decode(token.encode()).decode())
            if not isinstance(key, dict) or not isinstance(key.get("feedbackId"), str):
                raise ValueError()
            params["ExclusiveStartKey"] = {"feedbackId": key["feedbackId"]}
        except (ValueError, TypeError):
            return respond(400, {"error": "Invalid cursor."})
    if status:
        from boto3.dynamodb.conditions import Attr
        params["FilterExpression"] = Attr("status").eq(status)
    response = table.scan(**params)
    items = [x for x in response.get("Items", []) if not x["feedbackId"].startswith("LIMIT#")]
    items.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    next_key = response.get("LastEvaluatedKey")
    cursor = None
    if next_key:
        from base64 import urlsafe_b64encode
        cursor = urlsafe_b64encode(json.dumps(next_key).encode()).decode()
    return respond(200, {"feedback": items, "nextCursor": cursor})

def update_feedback(event):
    feedback_id = ((event.get("pathParameters") or {}).get("feedbackId") or "").strip()
    try:
        uuid.UUID(feedback_id)
    except (ValueError, TypeError):
        return respond(400, {"error": "Invalid feedback ID."})
    payload = parse_body(event)
    if payload is None or payload.get("status") not in STATUSES:
        return respond(400, {"error": "Invalid feedback status."})
    now = datetime.now(timezone.utc).isoformat()
    try:
        table.update_item(
            Key={"feedbackId": feedback_id},
            UpdateExpression="SET #status = :status, updatedAt = :now, reviewedBy = :admin",
            ConditionExpression="attribute_exists(feedbackId)",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": payload["status"], ":now": now, ":admin": administrator(event)},
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return respond(404, {"error": "Feedback not found."})
        raise
    return respond(200, {"feedbackId": feedback_id, "status": payload["status"]})

def lambda_handler(event, context):
    path = (event.get("rawPath") or "").rstrip("/")
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method", "").upper()
    if path == "/api/feedback" and method == "POST":
        return submit(event)
    if path == "/api/admin/feedback" or path.startswith("/api/admin/feedback/"):
        if not administrator(event):
            return respond(403, {"error": "Admin access required."})
        if path == "/api/admin/feedback" and method == "GET":
            return list_feedback(event)
        if method == "PATCH" and path.startswith("/api/admin/feedback/"):
            return update_feedback(event)
    return respond(404, {"error": "Not found."})
