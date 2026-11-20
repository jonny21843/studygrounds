"""Versioned legal acceptance records, keyed by authenticated Cognito sub."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import boto3
from botocore.exceptions import ClientError

table = boto3.resource("dynamodb").Table(os.environ["PREFERENCES_TABLE"])
DOCUMENTS = json.loads(Path(__file__).with_name("manifest.json").read_text(encoding="utf-8"))
if DOCUMENTS["terms"]["version"] != os.environ["LEGAL_TERMS_VERSION"] or DOCUMENTS["privacy"]["version"] != os.environ["LEGAL_PRIVACY_VERSION"]:
    raise RuntimeError("Published legal manifest is out of sync with configured versions")

AGE_KEY = "AGE#13_PLUS"
# Existing records only; never infer eligibility from a Terms acceptance without
# an explicit, previously stored age13OrOlderConfirmed=True field.
LEGACY_AGE_TERMS_VERSIONS = ("1.2", "1.1")

def age_confirmed(sub):
    key = {"pk": "USER#" + sub, "sk": AGE_KEY}
    current = table.get_item(Key=key, ConsistentRead=True).get("Item") or {}
    if current.get("age13OrOlderConfirmed") is True:
        return True

    for version in LEGACY_AGE_TERMS_VERSIONS:
        legacy = table.get_item(
            Key={"pk": "USER#" + sub, "sk": "LEGAL#terms#" + version},
            ConsistentRead=True,
        ).get("Item") or {}
        if legacy.get("age13OrOlderConfirmed") is not True:
            continue
        try:
            table.put_item(
                Item={
                    **key,
                    "age13OrOlderConfirmed": True,
                    "confirmedAt": legacy.get("acceptedAt") or datetime.now(timezone.utc).isoformat(),
                    "source": "legacy-terms-" + version,
                },
                ConditionExpression="attribute_not_exists(pk) AND attribute_not_exists(sk)",
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
        return True
    return False

def respond(status, body):
    return {"statusCode": status, "headers": {"Content-Type": "application/json", "Cache-Control": "no-store"}, "body": json.dumps(body)}

def lambda_handler(event, context):
    claims = ((((event.get("requestContext") or {}).get("authorizer") or {}).get("jwt") or {}).get("claims") or {})
    sub = claims.get("sub")
    if not sub:
        return respond(401, {"error": "Authentication required"})
    method = ((event.get("requestContext") or {}).get("http") or {}).get("method", "GET").upper()
    pending = table.get_item(
        Key={"pk": "USER#" + sub, "sk": "ACCOUNT#DELETION"},
        ConsistentRead=True,
    ).get("Item")
    if pending:
        return respond(423, {"error": "This account is scheduled for deletion.", "code": "ACCOUNT_DELETION_PENDING"})
    confirmed_age = age_confirmed(sub)
    if method == "GET":
        documents = {}
        for name, doc in DOCUMENTS.items():
            accepted = False
            accepted_at = None
            if doc["required"]:
                item = table.get_item(Key={"pk": "USER#" + sub, "sk": "LEGAL#" + name + "#" + doc["version"]}, ConsistentRead=True).get("Item") or {}
                accepted = bool(item.get("acceptedAt")) and item.get("contentHash") == doc["contentHash"]
                accepted_at = item.get("acceptedAt")
            documents[name] = dict(doc, accepted=accepted, acceptedAt=accepted_at)
        return respond(200, {"documents": documents, "ageConfirmed": confirmed_age, "required": not confirmed_age or not all(documents[k]["accepted"] for k in ("terms", "privacy"))})
    if method != "POST":
        return respond(405, {"error": "Method not allowed"})
    try:
        payload = json.loads(event.get("body") or "{}")
    except (TypeError, ValueError):
        return respond(400, {"error": "Invalid JSON"})
    required_fields = {"termsVersion", "privacyVersion", "termsHash", "privacyHash", "agreeToTerms", "acknowledgePrivacy"}
    if not isinstance(payload, dict) or not required_fields.issubset(payload) or set(payload) - required_fields - {"age13OrOlder"}:
        return respond(400, {"error": "Current document versions and confirmations are required"})
    if payload["termsVersion"] != DOCUMENTS["terms"]["version"] or payload["privacyVersion"] != DOCUMENTS["privacy"]["version"]:
        return respond(409, {"error": "Documents have changed. Please review current versions."})
    if payload["termsHash"] != DOCUMENTS["terms"]["contentHash"] or payload["privacyHash"] != DOCUMENTS["privacy"]["contentHash"]:
        return respond(409, {"error": "Published policies differ from the documents you reviewed. Refresh and try again."})

    # Previously accepted versions cannot be rewritten or silently accepted again.
    outstanding = {}
    for name in ("terms", "privacy"):
        doc = DOCUMENTS[name]
        record = table.get_item(
            Key={"pk": "USER#" + sub, "sk": "LEGAL#" + name + "#" + doc["version"]},
            ConsistentRead=True,
        ).get("Item") or {}
        outstanding[name] = not (bool(record.get("acceptedAt")) and record.get("contentHash") == doc["contentHash"])
    if outstanding["terms"] and payload["agreeToTerms"] is not True:
        return respond(400, {"error": "Agreement to the current Terms is required"})
    if outstanding["privacy"] and payload["acknowledgePrivacy"] is not True:
        return respond(400, {"error": "Acknowledgement of the current Privacy Policy is required"})
    if not confirmed_age and payload.get("age13OrOlder") is not True:
        return respond(403, {"error": "StudyGrounds accounts are available only to people age 13 or older."})
    if payload.get("age13OrOlder", True) is not True:
        return respond(403, {"error": "Invalid age confirmation"})
    now = datetime.now(timezone.utc).isoformat()
    if not confirmed_age:
        try:
            table.put_item(
                Item={
                    "pk": "USER#" + sub, "sk": AGE_KEY,
                    "age13OrOlderConfirmed": True, "confirmedAt": now,
                    "source": "initial-legal-acceptance",
                },
                ConditionExpression="attribute_not_exists(pk) AND attribute_not_exists(sk)",
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
    for name in ("terms", "privacy"):
        if not outstanding[name]:
            continue
        doc = DOCUMENTS[name]
        try:
            table.put_item(Item={
                "pk": "USER#" + sub,
                "sk": "LEGAL#" + name + "#" + doc["version"],
                "document": name,
                "version": doc["version"],
                "contentHash": doc["contentHash"],
                "effectiveDate": doc["effectiveDate"],
                "acceptedAt": now,
                "action": "agreed" if name == "terms" else "acknowledged",
            }, ConditionExpression="attribute_not_exists(pk) AND attribute_not_exists(sk)")
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
    return respond(200, {"accepted": True, "ageConfirmed": True})
