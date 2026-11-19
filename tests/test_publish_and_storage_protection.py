"""Regression tests for publication requests, storage checks and scan auto-publishing."""
import importlib.util
import json
import os
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import MagicMock, patch

import boto3
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parents[1]
FILE_KEY = "users/u-1/notes/n-1/original/file.pdf"
SIZE_LIMIT = 1024 ** 3


def condition_failed():
    return ClientError(
        {"Error": {"Code": "ConditionalCheckFailedException", "Message": "condition"}},
        "UpdateItem",
    )


def load(relative):
    tables = {}
    resource = MagicMock()
    resource.Table.side_effect = lambda name: tables.setdefault(name, MagicMock())
    clients = {}
    def client(name, **kwargs):
        return clients.setdefault(name, MagicMock())
    with patch.dict(os.environ, {
        "NOTES_TABLE": "notes", "SECURITY_TABLE": "security",
        "PREFERENCES_TABLE": "prefs", "COGNITO_USER_POOL_ID": "pool",
        "NOTES_BUCKET": "bucket", "MAX_ACCOUNT_STORAGE_BYTES": str(SIZE_LIMIT),
    }), patch.object(boto3, "resource", return_value=resource), patch.object(boto3, "client", side_effect=client):
        spec = importlib.util.spec_from_file_location(
            "protection_" + relative.split("/")[-2], ROOT / relative
        )
        app = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(app)
    return app, tables, clients


def note(status="NO_THREATS_FOUND", **overrides):
    data = {
        "userId": "u-1", "noteId": "n-1", "visibility": "private",
        "description": "Useful material",
        "files": [{"fileId": "f-1", "key": FILE_KEY,
                   "filename": "file.pdf", "sizeBytes": 100,
                   "malwareScanStatus": status}],
    }
    data.update(overrides)
    return data


def publish_event(published=True):
    return {
        "requestContext": {"authorizer": {"jwt": {"claims": {
            "sub": "u-1", "username": "test-user"
        }}}},
        "pathParameters": {"noteId": "n-1"},
        "body": json.dumps({"published": published}),
    }


class PublicationProtectionTests(TestCase):
    def setUp(self):
        self.app, self.tables, self.clients = load("backend/functions/notes/publish/app.py")
        self.tables["notes"].get_item.return_value = {"Item": note()}
        self.tables["notes"].update_item.return_value = {"Attributes": note(visibility="public")}
        self.tables["security"].get_item.return_value = {}
        self.clients["cognito-idp"].admin_get_user.return_value = {"UserAttributes": [
            {"Name": "given_name", "Value": "Test"},
            {"Name": "family_name", "Value": "Person"},
        ]}

    def test_direct_publication_reserves_one_quota_and_uses_conditional_write(self):
        result = self.app.lambda_handler(publish_event(), None)
        self.assertEqual(result["statusCode"], 200)
        quota = self.tables["prefs"].update_item.call_args.kwargs
        self.assertEqual(quota["Key"]["pk"], "USER#u-1")
        self.assertTrue(quota["Key"]["sk"].endswith("#publish"))
        self.assertEqual(quota["ExpressionAttributeValues"][":limit"], 10)
        update = self.tables["notes"].update_item.call_args.kwargs
        self.assertIn("publishPending", update["ConditionExpression"])

    def test_pending_scans_reserve_once_and_repeated_click_does_not_requeue(self):
        self.tables["notes"].get_item.return_value = {"Item": note("PENDING")}
        result = self.app.lambda_handler(publish_event(), None)
        self.assertEqual(result["statusCode"], 202)
        self.assertTrue(json.loads(result["body"])["publishPending"])
        update = self.tables["notes"].update_item.call_args.kwargs
        self.assertEqual(update["ExpressionAttributeValues"][":public"], "public")
        self.assertEqual(self.tables["prefs"].update_item.call_count, 1)
        self.tables["notes"].get_item.return_value = {"Item": note("PENDING", publishPending=True)}
        result = self.app.lambda_handler(publish_event(), None)
        self.assertEqual(result["statusCode"], 202)
        self.assertEqual(self.tables["prefs"].update_item.call_count, 1)

    def test_already_public_and_unpublish_do_not_consume_quota(self):
        self.tables["notes"].get_item.return_value = {"Item": note(visibility="public")}
        self.assertEqual(self.app.lambda_handler(publish_event(), None)["statusCode"], 200)
        self.assertEqual(self.app.lambda_handler(publish_event(False), None)["statusCode"], 200)
        self.tables["prefs"].update_item.assert_not_called()

    def test_quota_exhaustion_leaves_note_private(self):
        self.tables["prefs"].update_item.side_effect = condition_failed()
        result = self.app.lambda_handler(publish_event(), None)
        self.assertEqual(result["statusCode"], 429)
        self.assertEqual(json.loads(result["body"])["code"], "DAILY_PUBLISH_LIMIT")
        self.tables["notes"].update_item.assert_not_called()

    def test_moderation_still_blocks_before_quota(self):
        self.tables["notes"].get_item.return_value = {"Item": note(moderationHold=True)}
        self.assertEqual(self.app.lambda_handler(publish_event(), None)["statusCode"], 423)
        self.tables["prefs"].update_item.assert_not_called()


class StorageProtectionTests(TestCase):
    def setUp(self):
        self.app, self.tables, self.clients = load("backend/functions/notes/upload/app.py")
        self.tables["notes"].get_item.return_value = {"Item": note(files=[])}
        self.tables["security"].get_item.return_value = {}
        self.clients["s3"].list_objects_v2.return_value = {
            "Contents": [{"Key": "users/u-1/notes/old/original/source.pdf", "Size": SIZE_LIMIT - 1}],
            "IsTruncated": False,
        }

    def event(self, size=5, replacement=""):
        return {
            "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "u-1"}}}},
            "pathParameters": {"noteId": "n-1"},
            "body": json.dumps({"filename": "file.pdf", "contentType": "application/pdf",
                                "fileSize": size, "replaceFileId": replacement}),
        }

    def test_storage_limit_prevents_new_signed_upload(self):
        response = self.app.lambda_handler(self.event(), None)
        self.assertEqual(response["statusCode"], 413)
        self.assertEqual(json.loads(response["body"])["code"], "ACCOUNT_STORAGE_LIMIT")
        self.tables["prefs"].update_item.assert_not_called()
        self.clients["s3"].generate_presigned_post.assert_not_called()
        self.assertEqual(
            self.clients["s3"].list_objects_v2.call_args.kwargs["Prefix"], "users/u-1/"
        )

    def test_storage_counts_multiple_pages(self):
        self.clients["s3"].list_objects_v2.side_effect = [
            {"Contents": [{"Size": SIZE_LIMIT - 3}], "IsTruncated": True,
             "NextContinuationToken": "page-2"},
            {"Contents": [{"Size": 10}], "IsTruncated": False},
        ]
        self.assertEqual(self.app.current_account_storage_bytes("u-1"), SIZE_LIMIT + 7)
        self.assertEqual(self.clients["s3"].list_objects_v2.call_args.kwargs["ContinuationToken"], "page-2")

    def test_replacement_credits_existing_registered_size(self):
        self.tables["notes"].get_item.return_value = {
            "Item": note(files=[{"fileId": "f-1", "sizeBytes": 100, "key": FILE_KEY}])
        }
        self.clients["s3"].generate_presigned_post.return_value = {
            "url": "https://example.test", "fields": {}
        }
        result = self.app.lambda_handler(self.event(5, "f-1"), None)
        self.assertEqual(result["statusCode"], 200)
        self.tables["prefs"].update_item.assert_called_once()


class AutoPublishSafetyTests(TestCase):
    def setUp(self):
        self.app, self.tables, self.clients = load("backend/functions/security/malware_scan_result/app.py")
        self.current = note("PENDING", publishPending=True)
        self.updated = note("NO_THREATS_FOUND", publishPending=True)
        self.tables["notes"].get_item.return_value = {"Item": self.current}
        self.tables["notes"].update_item.return_value = {"Attributes": self.updated}
        self.tables["security"].get_item.return_value = {}
        self.event = {
            "detail": {
                "s3ObjectDetails": {"objectKey": FILE_KEY},
                "scanResultDetails": {"scanResultStatus": "NO_THREATS_FOUND"}
            }
        }

    def test_auto_publish_is_conditional_on_still_pending(self):
        result = self.app.lambda_handler(self.event, None)
        self.assertTrue(result["publishPending"])
        calls = self.tables["notes"].update_item.call_args_list
        self.assertGreaterEqual(len(calls), 2)
        self.assertIn("publishPending = :pending", calls[-1].kwargs["ConditionExpression"])
        self.assertIn("moderationHold", calls[-1].kwargs["ConditionExpression"])

    def test_unpublish_race_does_not_republish(self):
        self.tables["notes"].update_item.side_effect = [
            {"Attributes": self.updated}, condition_failed()
        ]
        self.assertTrue(self.app.lambda_handler(self.event, None)["updated"])

    def test_moderation_hold_prevents_automatic_publication(self):
        self.updated["moderationHold"] = True
        self.app.lambda_handler(self.event, None)
        args = self.tables["notes"].update_item.call_args.kwargs
        self.assertIn("publishScanError", args["UpdateExpression"])
        self.assertNotIn("visibility = :public", args["UpdateExpression"])

    def test_account_security_block_prevents_automatic_publication(self):
        self.tables["security"].get_item.return_value = {"Item": {"publishingBlocked": True}}
        self.app.lambda_handler(self.event, None)
        args = self.tables["notes"].update_item.call_args.kwargs
        self.assertIn("publishScanError", args["UpdateExpression"])


if __name__ == "__main__":
    main()
