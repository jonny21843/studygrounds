from legal_guard import require_legal_acceptance
import json
import os
import hashlib
import re

import boto3


cognito = boto3.client("cognito-idp")
user_pool_id = os.environ["COGNITO_USER_POOL_ID"]
profiles = boto3.resource("dynamodb").Table(os.environ["PREFERENCES_TABLE"])
AVATARS = {"indigo", "emerald", "rose", "amber", "slate", "ocean"}
PROFILE_KEY = "PUBLIC_PROFILE"

def contributor_id(user_id):
    # Same opaque identifier as the public contributor endpoint.
    return hashlib.sha256(
        ("studygrounds:contributor:v1:" + user_id).encode("utf-8")
    ).hexdigest()


def profile_fields(user_id):
    if not user_id:
        return {"bio": "", "avatarStyle": "indigo"}
    item = profiles.get_item(
        Key={"pk": "USER#" + user_id, "sk": PROFILE_KEY},
        ConsistentRead=True,
    ).get("Item") or {}
    return {
        "bio": item.get("bio") or "",
        "avatarStyle": item.get("avatarStyle") if item.get("avatarStyle") in AVATARS else "indigo",
    }


def validate_public_profile(payload):
    bio = payload.get("bio", "")
    avatar = payload.get("avatarStyle", "indigo")
    if not isinstance(bio, str) or len(bio) > 280:
        return None, "Bio must be 280 characters or fewer"
    if any(ord(ch) < 32 and ch not in "\n\t" for ch in bio):
        return None, "Bio contains unsupported characters"
    if not isinstance(avatar, str) or avatar not in AVATARS:
        return None, "Choose a valid avatar style"
    return {"bio": bio.strip(), "avatarStyle": avatar}, None



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


def username_from_event(event):
    return claims(event).get("username")


def attribute_map(user):
    return {
        item["Name"]: item.get("Value", "")
        for item in user.get("UserAttributes", [])
    }


def public_author(first_name, last_name):
    first = (first_name or "").strip()
    last = (last_name or "").strip()

    if first and last:
        return f"{first} {last[0].upper()}."

    return None


def get_profile(username, user_id):
    user = cognito.admin_get_user(
        UserPoolId=user_pool_id,
        Username=username,
    )
    attributes = attribute_map(user)
    first_name = attributes.get("given_name", "")
    last_name = attributes.get("family_name", "")

    return {
        "firstName": first_name,
        "lastName": last_name,
        "complete": bool(first_name.strip() and last_name.strip()),
        "publicAuthor": public_author(first_name, last_name),
        "contributorId": contributor_id(user_id),
        **profile_fields(user_id),
    }


def lambda_handler(event, context):
    legal_block = require_legal_acceptance(event)
    if legal_block is not None:
        return legal_block
    username = username_from_event(event) or claims(event).get("cognito:username")
    user_id = claims(event).get("sub")
    if not username or not user_id:
        return response(401, {"error": "Authenticated identity is missing"})

    method = (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", "GET")
        .upper()
    )

    if method == "GET":
        return response(200, {"profile": get_profile(username, user_id)})

    if method != "PATCH":
        return response(405, {"error": "Method not allowed"})

    try:
        payload = json.loads(event.get("body") or "{}")
    except (json.JSONDecodeError, TypeError):
        return response(400, {"error": "Request body must be valid JSON"})
    if not isinstance(payload, dict):
        return response(400, {"error": "Profile must be a JSON object"})

    first_name = (payload.get("firstName") or "").strip()
    last_name = (payload.get("lastName") or "").strip()

    if not first_name or not last_name:
        return response(400, {"error": "First name and last name are required"})

    if len(first_name) > 60 or len(last_name) > 60:
        return response(400, {"error": "Names must be 60 characters or fewer"})

    public_fields, error = validate_public_profile({
        "bio": payload.get("bio", profile_fields(user_id)["bio"]),
        "avatarStyle": payload.get("avatarStyle", profile_fields(user_id)["avatarStyle"]),
    })
    if error:
        return response(400, {"error": error})

    cognito.admin_update_user_attributes(
        UserPoolId=user_pool_id,
        Username=username,
        UserAttributes=[
            {"Name": "given_name", "Value": first_name},
            {"Name": "family_name", "Value": last_name},
        ],
    )

    profiles.put_item(Item={
        "pk": "USER#" + user_id,
        "sk": PROFILE_KEY,
        **public_fields,
    })
    return response(
        200,
        {
            "profile": {
                "firstName": first_name,
                "lastName": last_name,
                "complete": True,
                "publicAuthor": public_author(first_name, last_name),
                "contributorId": contributor_id(user_id),
                **public_fields,
            }
        },
    )
