"""Retryable SQS account-deletion worker.

Deletes user-owned content and pseudonymizes moderation records. Cognito is removed
last. A queue DLQ retains failed jobs for operational investigation.
"""
import json
import os
import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

aws = boto3.resource("dynamodb")
notes = aws.Table(os.environ["NOTES_TABLE"])
saved = aws.Table(os.environ["SAVED_NOTES_TABLE"])
votes = aws.Table(os.environ["HELPFUL_VOTES_TABLE"])
activity = aws.Table(os.environ["STUDY_ACTIVITY_TABLE"])
prefs = aws.Table(os.environ["PREFERENCES_TABLE"])
security = aws.Table(os.environ["SECURITY_TABLE"])
feedback = aws.Table(os.environ["FEEDBACK_TABLE"])
moderation = aws.Table(os.environ["REPORTS_TABLE"])
bucket = os.environ["NOTES_BUCKET"]
pool = os.environ["COGNITO_USER_POOL_ID"]
s3 = boto3.client("s3")
cognito = boto3.client("cognito-idp")
MARKER = "ACCOUNT#DELETION"

def remove_partition(table, partition_key, sort_key, value, skip=None):
    """Repeat first page while deleting, so no pagination gaps are created."""
    while True:
        result = table.query(
            KeyConditionExpression=Key(partition_key).eq(value),
            ConsistentRead=True, Limit=100,
        )
        items = result.get("Items") or []
        if not items:
            return
        with table.batch_writer() as batch:
            for item in items:
                if skip and item.get(sort_key) == skip:
                    continue
                batch.delete_item(Key={partition_key: item[partition_key], sort_key: item[sort_key]})
        if skip and len(items) == 1 and items[0].get(sort_key) == skip:
            return

def delete_s3_prefix(sub):
    prefix = "users/" + sub + "/"
    # Repeat first page after each delete to avoid continuation tokens into removed items.
    while True:
        page = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=1000)
        keys = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
        if not keys:
            break
        s3.delete_objects(Bucket=bucket, Delete={"Objects": keys, "Quiet": True})

def scan_matches(table, match, fields):
    start = None
    while True:
        kwargs = {"FilterExpression": match, "ProjectionExpression": ", ".join(fields), "Limit": 100}
        if start:
            kwargs["ExclusiveStartKey"] = start
        page = table.scan(**kwargs)
        for item in page.get("Items") or []:
            yield item
        start = page.get("LastEvaluatedKey")
        if not start:
            break

def scrub_moderation(sub):
    matches = Attr("reporterId").eq(sub) | Attr("noteOwnerId").eq(sub)
    for item in scan_matches(moderation, matches, ["reportId"]):
        moderation.update_item(
            Key={"reportId": item["reportId"]},
            UpdateExpression="REMOVE reporterId, reporterEmail, noteOwnerId, noteTitle",
        )

def remove_feedback(sub):
    for item in scan_matches(feedback, Attr("userId").eq(sub), ["feedbackId"]):
        feedback.delete_item(Key={"feedbackId": item["feedbackId"]})
    feedback.delete_item(Key={"feedbackId": "LIMIT#" + sub})

def remove_account(sub, request_id):
    key = {"pk": "USER#" + sub, "sk": MARKER}
    state = prefs.get_item(Key=key, ConsistentRead=True).get("Item")
    if not state or state.get("requestId") != request_id:
        return
    username = state.get("username")
    if not username:
        raise RuntimeError("Deletion request is missing the Cognito username")
    # Ensure a previously published note cannot be fetched during deletion.
    remove_partition(notes, "userId", "noteId", sub)
    delete_s3_prefix(sub)
    remove_partition(saved, "userId", "noteId", sub)
    remove_partition(activity, "userId", "recordKey", sub)
    remove_partition(votes, "userId", "noteId", sub)
    remove_feedback(sub)
    scrub_moderation(sub)
    remove_partition(security, "pk", "sk", "USER#" + sub)
    remove_partition(prefs, "pk", "sk", "USER#" + sub, skip=MARKER)
    try:
        cognito.admin_delete_user(UserPoolId=pool, Username=username)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "UserNotFoundException":
            raise
    prefs.delete_item(Key=key)

def lambda_handler(event, context):
    for record in event.get("Records") or []:
        message = json.loads(record["body"])
        sub = message.get("sub")
        req = message.get("requestId")
        if not isinstance(sub, str) or not sub or not isinstance(req, str) or not req:
            raise ValueError("Malformed deletion job")
        remove_account(sub, req)
    return {"ok": True}
