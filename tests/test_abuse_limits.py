"""Atomic abuse quota tests: isolation, UTC windows and HTTP 429 behavior."""
import importlib.util
import json
import os
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import MagicMock, patch
import boto3

ROOT = Path(__file__).resolve().parents[1]


class LimitHit(Exception):
    response = {"Error": {"Code": "ConditionalCheckFailedException"}}


def load(relative, name):
    resource = MagicMock()
    tables = {}
    resource.Table.side_effect = lambda table_name: tables.setdefault(table_name, MagicMock())
    with patch.dict(os.environ, {
        "NOTES_TABLE": "notes", "PREFERENCES_TABLE": "prefs",
        "SECURITY_TABLE": "security", "NOTES_BUCKET": "bucket",
        "REPORTS_TABLE": "reports",
    }), patch.object(boto3, "resource", return_value=resource), patch.object(boto3, "client"):
        spec = importlib.util.spec_from_file_location(name, ROOT / relative)
        app = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(app)
    return app, tables


class QuotaTests(TestCase):
    def setUp(self):
        self.create, self.create_tables = load("backend/functions/notes/create/app.py", "quota_create")
        self.upload, self.upload_tables = load("backend/functions/notes/upload/app.py", "quota_upload")
        self.report, self.report_tables = load("backend/functions/public/report/app.py", "quota_report")

    def test_atomic_user_scoping_and_ttl(self):
        for app, tables in ((self.create, self.create_tables), (self.upload, self.upload_tables), (self.report, self.report_tables)):
            self.assertTrue(app.reserve_daily_action("user-x", "create", 30))
            args = tables["prefs"].update_item.call_args.kwargs
            self.assertEqual(args["Key"]["pk"], "USER#user-x")
            self.assertTrue(args["Key"]["sk"].startswith("QUOTA#"))
            self.assertEqual(args["ExpressionAttributeValues"][":limit"], 30)
            self.assertEqual(args["ExpressionAttributeValues"][":one"], 1)
            self.assertIn("attribute_not_exists", args["ConditionExpression"])
            self.assertIn("expiresAt", args["UpdateExpression"])

    def test_quota_limit_returns_false(self):
        self.create_tables["prefs"].update_item.side_effect = LimitHit()
        self.assertFalse(self.create.reserve_daily_action("user-x", "create", 1))

    def test_create_exceeded_returns_429_without_writing_note(self):
        self.create_tables["prefs"].update_item.side_effect = LimitHit()
        payload = {"title": "My note", "subject": "Math", "description": "Study material"}
        event = {"requestContext": {"authorizer": {"jwt": {"claims": {"sub": "user-x"}}}}, "body": json.dumps(payload)}
        response = self.create.lambda_handler(event, None)
        self.assertEqual(response["statusCode"], 429)
        self.assertEqual(json.loads(response["body"])["code"], "DAILY_NOTE_LIMIT")
        self.create_tables["notes"].put_item.assert_not_called()

    def test_repeated_report_never_consumes_quota(self):
        self.report_tables["notes"].query.return_value = {
            "Items": [{"userId": "author", "noteId": "note-x", "visibility": "public"}],
        }
        self.report_tables["reports"].get_item.return_value = {"Item": {"reportId": "existing"}}
        event = {
            "requestContext": {
                "authorizer": {"jwt": {"claims": {"sub": "reporter-x", "email": "example@example.com"}}},
                "http": {"method": "POST"}
            },
            "pathParameters": {"noteId": "note-x"},
            "body": json.dumps({"reason": "spam"}),
        }
        response = self.report.lambda_handler(event, None)
        self.assertEqual(response["statusCode"], 409)
        self.report_tables["prefs"].update_item.assert_not_called()

    def test_report_exceeded_returns_429(self):
        self.report_tables["notes"].query.return_value = {
            "Items": [{"userId": "author", "noteId": "note-x", "visibility": "public"}],
        }
        self.report_tables["reports"].get_item.return_value = {}
        self.report_tables["prefs"].update_item.side_effect = LimitHit()
        event = {
            "requestContext": {
                "authorizer": {"jwt": {"claims": {"sub": "reporter-x"}}},
                "http": {"method": "POST"},
            },
            "pathParameters": {"noteId": "note-x"},
            "body": json.dumps({"reason": "spam"}),
        }
        response = self.report.lambda_handler(event, None)
        self.assertEqual(response["statusCode"], 429)
        self.report_tables["reports"].put_item.assert_not_called()


if __name__ == "__main__":
    main()
