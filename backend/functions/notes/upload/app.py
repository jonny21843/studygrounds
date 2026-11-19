from legal_guard import require_legal_acceptance
import json
import os
import re
import uuid
from datetime import datetime, timezone

import boto3
from botocore.config import Config


dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["NOTES_TABLE"])
security_table = dynamodb.Table(os.environ["SECURITY_TABLE"])
quota_table = dynamodb.Table(os.environ.get("PREFERENCES_TABLE", "studygrounds-quota-test"))
bucket_name = os.environ["NOTES_BUCKET"]
aws_region = os.environ.get("AWS_REGION", "us-east-2")
max_file_bytes = int(os.environ.get("MAX_FILE_BYTES", str(20 * 1024 * 1024)))
max_files_per_note = int(os.environ.get("MAX_FILES_PER_NOTE", "10"))
max_account_storage_bytes = int(os.environ.get("MAX_ACCOUNT_STORAGE_BYTES", str(1024 ** 3)))

s3 = boto3.client(
    "s3",
    region_name=aws_region,
    endpoint_url=f"https://s3.{aws_region}.amazonaws.com",
    config=Config(signature_version="s3v4"),
)

SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._ -]+")
ALLOWED_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.apple.pages",
    "application/x-iwork-pages-sffpages",
    "application/octet-stream",
}
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp", ".pptx", ".xlsx", ".docx", ".pages"}


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def current_user_id(event):
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
        .get("sub")
    )


def security_profile(user_id):
    return security_table.get_item(
        Key={"pk": f"USER#{user_id}", "sk": "PROFILE"}
    ).get("Item") or {}


def upload_block_reason(profile):
    if profile.get("uploadBlocked"):
        return "Uploads are disabled for this account pending a security review."

    blocked_until = profile.get("uploadBlockedUntil")
    if blocked_until:
        try:
            until = datetime.fromisoformat(blocked_until.replace("Z", "+00:00"))
            if until > datetime.now(timezone.utc):
                return "Uploads are temporarily paused after a security scan detected malware."
        except (TypeError, ValueError):
            return "Uploads are temporarily paused pending a security review."

    return None


def safe_filename(value):
    cleaned = SAFE_FILENAME.sub("_", value or "").strip(" .")
    return cleaned[:180] or "upload"


def file_extension(filename):
    lowered = filename.lower()
    for extension in ALLOWED_EXTENSIONS:
        if lowered.endswith(extension):
            return extension
    return ""



def reserve_daily_action(user_id, action, limit):
    """UTC-day per-account counter; DynamoDB conditional updates are atomic."""
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        quota_table.update_item(
            Key={"pk": "USER#" + user_id, "sk": "QUOTA#" + day + "#" + action},
            UpdateExpression="ADD #used :one SET expiresAt = :expires",
            ConditionExpression="attribute_not_exists(#used) OR #used < :limit",
            ExpressionAttributeNames={"#used": "used"},
            ExpressionAttributeValues={":one": 1, ":limit": limit, ":expires": int(midnight.timestamp()) + 3 * 86400},
        )
        return True
    except Exception as error:
        if getattr(error, "response", {}).get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise


def current_account_storage_bytes(user_id):
    """Count current S3 objects, including orphaned uploads, under this user only.

    This is a preflight safeguard, not an atomic storage reservation; concurrent
    signed uploads can briefly exceed the limit.
    """
    prefix = f"users/{user_id}/"
    total = 0
    token = None
    while True:
        kwargs = {"Bucket": bucket_name, "Prefix": prefix, "MaxKeys": 1000}
        if token:
            kwargs["ContinuationToken"] = token
        result = s3.list_objects_v2(**kwargs)
        total += sum(int(item.get("Size") or 0) for item in result.get("Contents", []))
        if not result.get("IsTruncated"):
            return total
        token = result.get("NextContinuationToken")
        if not token:
            raise RuntimeError("Incomplete S3 storage listing")


def lambda_handler(event, context):
    legal_block = require_legal_acceptance(event)
    if legal_block is not None:
        return legal_block
    user_id = current_user_id(event)
    if not user_id:
        return response(401, {"error": "Authenticated user ID is missing"})

    block_reason = upload_block_reason(security_profile(user_id))
    if block_reason:
        return response(423, {"error": block_reason, "code": "UPLOAD_SECURITY_BLOCK"})

    note_id = (event.get("pathParameters") or {}).get("noteId")
    if not note_id:
        return response(400, {"error": "noteId is required"})

    note = table.get_item(Key={"userId": user_id, "noteId": note_id}).get("Item")
    if not note:
        return response(404, {"error": "Note not found"})

    try:
        payload = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Request body must be valid JSON"})

    raw_filename = (payload.get("filename") or "").strip()
    replace_file_id = (payload.get("replaceFileId") or "").strip()
    filename = safe_filename(raw_filename)

    files = note.get("files") or []
    replacing = bool(replace_file_id and any(item.get("fileId") == replace_file_id for item in files))
    if len(files) >= max_files_per_note and not replacing:
        return response(
            400,
            {"error": f"A note can have at most {max_files_per_note} source files"},
        )

    if replace_file_id and not replacing:
        return response(404, {"error": "Source file to replace was not found"})
    content_type = (payload.get("contentType") or "").strip().lower()

    try:
        file_size = int(payload.get("fileSize") or 0)
    except (TypeError, ValueError):
        file_size = 0

    extension = file_extension(raw_filename)
    if not raw_filename or extension not in ALLOWED_EXTENSIONS:
        return response(
            400,
            {"error": "Only PDF, JPG, PNG, WEBP, DOCX, PPTX, XLSX, and PAGES files are allowed"},
        )

    pages_type_ok = extension == ".pages" and content_type in {
        "application/vnd.apple.pages",
        "application/x-iwork-pages-sffpages",
        "application/octet-stream",
    }
    if content_type not in ALLOWED_TYPES or (content_type == "application/octet-stream" and not pages_type_ok):
        return response(
            400,
            {"error": "Unsupported file type. Use PDF, JPG, PNG, WEBP, DOCX, PPTX, XLSX, or PAGES"},
        )

    if file_size <= 0:
        return response(400, {"error": "File size is required"})

    if file_size > max_file_bytes:
        return response(
            400,
            {"error": f"File is too large. Maximum size is {max_file_bytes // (1024 * 1024)} MB"},
        )

    # Do not issue another presigned upload if the account is already at its
    # storage allowance. Existing objects and unregistered uploads both count.
    replacing_size = 0
    if replacing:
        replacing_size = int(next((item.get("sizeBytes") or 0 for item in files
                                  if item.get("fileId") == replace_file_id), 0))
    projected_bytes = current_account_storage_bytes(user_id) + file_size - replacing_size
    if projected_bytes > max_account_storage_bytes:
        return response(413, {
            "error": "Your account has reached its 1 GB source-file storage allowance. Remove unused files before uploading more.",
            "code": "ACCOUNT_STORAGE_LIMIT",
        })

    if not reserve_daily_action(user_id, "upload", int(os.environ.get("MAX_DAILY_UPLOAD_REQUESTS", "30"))):
        return response(429, {"error": "Daily upload request limit reached. Try again tomorrow (UTC).", "code": "DAILY_UPLOAD_LIMIT"})

    object_id = str(uuid.uuid4())
    key = f"users/{user_id}/notes/{note_id}/original/{object_id}-{filename}"

    upload = s3.generate_presigned_post(
        Bucket=bucket_name,
        Key=key,
        Fields={
            "Content-Type": content_type,
        },
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, max_file_bytes],
        ],
        ExpiresIn=300,
    )

    return response(
        200,
        {
            "uploadUrl": upload["url"],
            "uploadFields": upload["fields"],
            "key": key,
            "expiresIn": 300,
            "maxFileBytes": max_file_bytes,
            "replaceFileId": replace_file_id or None,
        },
    )
