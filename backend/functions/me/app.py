import json
import os
import boto3


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    authorizer = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
    )
    claims = authorizer.get("claims", {})

    if claims.get("token_use") != "access":
        return response(403, {"error": "Access token required"})

    user_id = claims.get("sub")

    if not user_id:
        return response(401, {"error": "Authenticated user ID is missing"})

    marker = boto3.resource("dynamodb").Table(os.environ["LEGAL_PREFERENCES_TABLE"]).get_item(
        Key={"pk": "USER#" + user_id, "sk": "ACCOUNT#DELETION"},
        ConsistentRead=True,
    ).get("Item")
    if marker:
        return response(423, {
            "error": "This account is scheduled for deletion.",
            "code": "ACCOUNT_DELETION_PENDING",
        })

    return response(
        200,
        {
            "userId": user_id,
            "username": claims.get("username"),
        },
    )
