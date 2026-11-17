"""Study activity API regression tests; no real AWS account required.

Run: python -m unittest discover -s tests -p 'test_study_activity.py'
Requires boto3.
"""
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

import boto3

ROOT = Path(__file__).resolve().parents[1]
NOTE = "123e4567-e89b-42d3-a456-426614174000"
SESSION = "123e4567-e89b-42d3-a456-426614174001"
STARTED = "2026-11-17T10:00:00+00:00"


class TransactionConflict(Exception):
    response = {"Error": {"Code": "TransactionCanceledException"}}


class StudyActivityTests(unittest.TestCase):
    def setUp(self):
        self.notes = MagicMock()
        self.activity = MagicMock()
        self.client = MagicMock()
        fake_resource = MagicMock()
        fake_resource.Table.side_effect = lambda name: self.notes if name == "notes" else self.activity
        with patch.dict(os.environ, {"NOTES_TABLE": "notes", "STUDY_ACTIVITY_TABLE": "activity", "SAVED_NOTES_TABLE": "saved"}):
            with patch.object(boto3, "resource", return_value=fake_resource):
                with patch.object(boto3, "client", return_value=self.client):
                    spec = importlib.util.spec_from_file_location(
                        "study_activity_test", ROOT / "backend/functions/study/app.py"
                    )
                    self.api = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(self.api)
        self.note = {
            "userId": "author", "noteId": NOTE, "visibility": "public",
            "title": "Linux study guide", "subject": "Technology",
            "files": [{"fileId": "file-1", "malwareScanStatus": "NO_THREATS_FOUND"}]
        }
        self.notes.query.return_value = {"Items": [self.note]}
        self.notes.get_item.return_value = {"Item": self.note}
        self.activity.query.return_value = {"Items": []}
        self.activity.get_item.return_value = {}

    def call(self, method, path, params=None, payload=None, user="reader"):
        event = {
            "rawPath": path,
            "requestContext": {
                "http": {"method": method},
                "authorizer": {"jwt": {"claims": {"sub": user}}},
            },
            "pathParameters": params or {},
            "body": json.dumps(payload or {}),
        }
        result = self.api.lambda_handler(event, None)
        return result["statusCode"], json.loads(result["body"])

    def test_login_and_validation_required(self):
        self.assertEqual(self.call("GET", "/api/study", user=None)[0], 401)
        self.assertEqual(self.call("PUT", "/api/study/progress/nope", {"noteId": "nope"}, {"fileId": "file-1"})[0], 400)
        self.assertEqual(self.call("POST", "/api/study/sessions", payload={"noteId": "nope"})[0], 400)

    def test_progress_is_private_and_validates_live_source(self):
        code, body = self.call("PUT", "/api/study/progress/" + NOTE, {"noteId": NOTE}, {"fileId": "file-1"})
        self.assertEqual(code, 200)
        kwargs = self.activity.update_item.call_args.kwargs
        self.assertEqual(kwargs["Key"], {"userId": "reader", "recordKey": "PROGRESS#" + NOTE})
        self.assertEqual(kwargs["ExpressionAttributeValues"][":owner"], "author")
        self.assertNotIn("files", json.dumps(kwargs))
        self.assertEqual(self.call("PUT", "/api/study/progress/" + NOTE, {"noteId": NOTE}, {"fileId": "unlisted"})[0], 400)

    def test_private_and_moderated_notes_block_new_activity(self):
        for altered in [
            dict(self.note, visibility="private"),
            dict(self.note, moderationHold=True),
            dict(self.note, files=[{"fileId": "file-1", "malwareScanStatus": "THREATS_FOUND"}]),
        ]:
            self.notes.get_item.return_value = {"Item": altered}
            self.assertEqual(self.call("PUT", "/api/study/progress/" + NOTE, {"noteId": NOTE}, {"fileId": "file-1"})[0], 404)
            self.assertEqual(self.call("POST", "/api/study/sessions", payload={"noteId": NOTE})[0], 404)
        self.client.transact_write_items.assert_not_called()

    def test_start_uses_atomic_active_slot(self):
        code, result = self.call("POST", "/api/study/sessions", payload={"noteId": NOTE})
        self.assertEqual(code, 201)
        txn = self.client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(txn[0]["Put"]["Item"]["recordKey"]["S"], "ACTIVE")
        self.assertEqual(txn[1]["Put"]["Item"]["noteId"]["S"], NOTE)
        self.assertEqual(txn[0]["Put"]["Item"]["userId"]["S"], "reader")
        self.assertIn("attribute_not_exists", txn[0]["Put"]["ConditionExpression"])

    def test_duplicate_active_session_rejected(self):
        self.client.transact_write_items.side_effect = TransactionConflict()
        code, body = self.call("POST", "/api/study/sessions", payload={"noteId": NOTE})
        self.assertEqual(code, 409)

    def test_finish_is_user_scoped_and_transactional(self):
        self.activity.get_item.return_value = {"Item": {
            "status": "active", "sessionId": SESSION, "startedAt": STARTED
        }}
        code, result = self.call(
            "PATCH", "/api/study/sessions/" + SESSION,
            {"sessionId": SESSION}, {"startedAt": STARTED}, user="alice"
        )
        self.assertEqual(code, 200)
        self.activity.get_item.assert_called_with(
            Key={"userId": "alice", "recordKey": "SESSION#" + STARTED + "#" + SESSION},
            ConsistentRead=True,
        )
        txn = self.client.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(txn[0]["Update"]["Key"]["userId"]["S"], "alice")
        self.assertEqual(txn[1]["Delete"]["Key"]["recordKey"]["S"], "ACTIVE")
        self.assertIn("sessionId", txn[1]["Delete"]["ConditionExpression"])

    def test_completed_session_idempotent(self):
        self.activity.get_item.return_value = {"Item": {
            "status": "completed", "minutes": 18, "endedAt": STARTED
        }}
        code, body = self.call("PATCH", "/api/study/sessions/" + SESSION,
                               {"sessionId": SESSION}, {"startedAt": STARTED})
        self.assertEqual(code, 200)
        self.assertEqual(body["session"]["minutes"], 18)
        self.client.transact_write_items.assert_not_called()

    def test_dashboard_never_returns_unpublished_metadata(self):
        self.activity.query.side_effect = [
            {"Items": [{
                "userId": "reader", "noteId": NOTE, "recordKey": "PROGRESS#" + NOTE,
                "fileId": "file-1", "lastOpenedAt": STARTED, "noteOwnerId": "author"
            }]},
            {"Items": [{
                "userId": "reader", "noteId": NOTE, "recordKey": "SESSION#" + STARTED + "#" + SESSION,
                "sessionId": SESSION, "startedAt": STARTED, "status": "completed",
                "minutes": 12, "noteOwnerId": "author"
            }]},
        ]
        self.notes.get_item.return_value = {"Item": dict(self.note, visibility="private")}
        code, body = self.call("GET", "/api/study")
        self.assertEqual(code, 200)
        self.assertEqual(body["continueStudying"][0]["available"], False)
        self.assertEqual(body["sessions"][0]["available"], False)
        self.assertNotIn("Linux study guide", json.dumps(body))
        self.assertNotIn("file-1", json.dumps(body))
        self.assertNotIn("author", json.dumps(body))

    def test_dashboard_owner_is_always_the_requester(self):
        self.call("GET", "/api/study", user="bob")
        for query in self.activity.query.call_args_list:
            self.assertIn("KeyConditionExpression", query.kwargs)
        self.activity.get_item.assert_called_with(
            Key={"userId": "bob", "recordKey": "ACTIVE"}, ConsistentRead=True
        )

    def test_active_session_outside_recent_window_is_loaded(self):
        self.activity.query.side_effect = [{"Items": []}, {"Items": []}]
        self.activity.get_item.side_effect = [
            {"Item": {"sessionKey": "SESSION#" + STARTED + "#" + SESSION}},
            {"Item": {
                "noteId": NOTE, "noteOwnerId": "author",
                "sessionId": SESSION, "startedAt": STARTED,
                "status": "active"
            }},
        ]
        code, body = self.call("GET", "/api/study")
        self.assertEqual(code, 200)
        self.assertEqual(body["sessions"][0]["sessionId"], SESSION)
        self.assertEqual(body["sessions"][0]["status"], "active")


if __name__ == "__main__":
    unittest.main()
