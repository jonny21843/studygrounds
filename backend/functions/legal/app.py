"""Versioned legal acceptance records, keyed by authenticated Cognito sub."""
import json
import os
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError

table = boto3.resource("dynamodb").Table(os.environ["PREFERENCES_TABLE"])
DOCUMENTS = {
    "terms": {"version": os.environ["LEGAL_TERMS_VERSION"], "effectiveDate": "2026-11-19", "url": "/terms.html", "required": True},
    "privacy": {"version": os.environ["LEGAL_PRIVACY_VERSION"], "effectiveDate": "2026-11-19", "url": "/privacy.html", "required": True},
    "guidelines": {"version": "1.0", "effectiveDate": "2026-11-19", "url": "/community-guidelines.html", "required": False},
}

def respond(status, body):
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"}, "body": json.dumps(body)}

def lambda_handler(event, context):
    claims = ((((event.get("requestContext") or {}).get("authorizer") or {}).get("jwt") or {}).get("claims") or {})
    sub = claims.get("sub")
    if not sub:
        return respond(401, {"error": "Authentication required"})
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method", "GET").upper()
    if method == "GET":
        documents = {}
        for name, doc in DOCUMENTS.items():
            accepted = False
            accepted_at = None
            if doc["required"]:
                item = table.get_item(Key={"pk": "USER#" + sub, "sk": "LEGAL#" + name + "#" + doc["version"]}, ConsistentRead=True).get("Item") or {}
                accepted = bool(item.get("acceptedAt"))
                accepted_at = item.get("acceptedAt")
            documents[name] = dict(doc, accepted=accepted, acceptedAt=accepted_at)
        return respond(200, {"documents": documents, "required": not all(documents[k]["accepted"] for k in ("terms", "privacy"))})
    if method != "POST":
        return respond(405, {"error": "Method not allowed"})
    try:
        payload = json.loads(event.get("body") or "{}")
    except (TypeError, ValueError):
        return respond(400, {"error": "Invalid JSON"})
    if not isinstance(payload, dict) or set(payload) != {"termsVersion", "privacyVersion", "agreeToTerms", "acknowledgePrivacy", "age13OrOlder"}:
        return respond(400, {"error": "Both document versions and confirmations are required"})
    if payload["termsVersion"] != DOCUMENTS["terms"]["version"] or payload["privacyVersion"] != DOCUMENTS["privacy"]["version"]:
        return respond(409, {"error": "Documents have changed. Please review current versions."})
    if payload["agreeToTerms"] is not True or payload["acknowledgePrivacy"] is not True:
        return respond(400, {"error": "Affirmative agreement and acknowledgement required"})
    if payload["age13OrOlder"] is not True:
        return respond(403, {"error": "StudyGrounds accounts are available only to people age 13 or older."})
    now = datetime.now(timezone.utc).isoformat()
    for name in ("terms", "privacy"):
        doc = DOCUMENTS[name]
        try:
            table.put_item(Item={
                "pk": "USER#" + sub,
                "sk": "LEGAL#" + name + "#" + doc["version"],
                "document": name,
                "version": doc["version"],
                "effectiveDate": doc["effectiveDate"],
                "acceptedAt": now,
                "action": "agreed" if name == "terms" else "acknowledged",
                **({"age13OrOlderConfirmed": True} if name == "terms" else {}),
            }, ConditionExpression="attribute_not_exists(pk) AND attribute_not_exists(sk)")
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
    return respond(200, {"accepted": True})
