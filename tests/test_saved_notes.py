"""Tests for authenticated Saved Notes API.

Run: python -m unittest discover -s tests -p 'test_saved_notes.py'
Uses mock DynamoDB resources; no AWS credentials required. Requires boto3.
"""
import importlib.util
import json
import os
from pathlib import Path
from unittest import TestCase, main
from unittest.mock import MagicMock, patch

import boto3

APP_PATH = Path(__file__).resolve().parents[1] / "backend/functions/saved/app.py"
NOTE = "123e4567-e89b-42d3-a456-426614174000"
SECOND = "123e4567-e89b-42d3-a456-426614174001"


class ConditionFailed(Exception):
    response = {"Error": {"Code": "ConditionalCheckFailedException"}}


class SavedNotesTests(TestCase):
    def setUp(self):
        self.notes_table = MagicMock()
        self.saved_table = MagicMock()
        fake_resource = MagicMock()
        fake_resource.Table.side_effect = lambda name: (
            self.notes_table if name == "notes" else self.saved_table
        )
        with patch.dict(os.environ, {"NOTES_TABLE": "notes", "SAVED_NOTES_TABLE": "saved"}):
            with patch.object(boto3, "resource", return_value=fake_resource):
                spec = importlib.util.spec_from_file_location("saved_api_test", APP_PATH)
                self.api = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(self.api)
        self.notes_table.query.return_value = {"Items": [self.note()]}
        self.notes_table.get_item.return_value = {"Item": self.note()}
        self.saved_table.get_item.return_value = {}
        self.saved_table.query.return_value = {"Items": []}

    def note(self, visibility="public", status="NO_THREATS_FOUND", hold=False):
        return {
            "noteId": NOTE,
            "userId": "author",
            "title": "Shared material",
            "subject": "Math",
            "description": "Study aid",
            "publicAuthor": "A. B.",
            "files": [{"filename": "doc.pdf", "malwareScanStatus": status}],
            "visibility": visibility,
            "moderationHold": hold,
        }

    def call(self, method, note_id=None, owner="alice", params=None):
        event = {
            "requestContext": {
                "http": {"method": method},
                "authorizer": {"jwt": {"claims": {"sub": owner}}},
            },
            "pathParameters": {"noteId": note_id} if note_id is not None else None,
            "queryStringParameters": params,
        }
        if params is not None and method == "PATCH":
            event["body"] = json.dumps(params)
        result = self.api.lambda_handler(event, None)
        return result["statusCode"], json.loads(result["body"])

    def test_save_is_restricted_to_published_safe_notes(self):
        for state in [
            self.note("private"),
            self.note("public", "THREATS_FOUND"),
            self.note("public", hold=True),
        ]:
            self.notes_table.get_item.return_value = {"Item": state}
            code, data = self.call("PUT", NOTE)
            self.assertEqual(code, 404)
            self.saved_table.put_item.assert_not_called()
        self.notes_table.get_item.return_value = {"Item": self.note()}
        code, data = self.call("PUT", NOTE)
        self.assertEqual((code, data["saved"]), (200, True))
        args = self.saved_table.put_item.call_args.kwargs
        self.assertEqual(args["Item"]["userId"], "alice")
        self.assertEqual(args["Item"]["noteId"], NOTE)
        self.assertEqual(args["Item"]["noteOwnerId"], "author")
        self.notes_table.get_item.assert_called_with(
            Key={"userId": "author", "noteId": NOTE}, ConsistentRead=True
        )
        self.assertEqual(args["ConditionExpression"], "attribute_not_exists(userId) AND attribute_not_exists(noteId)")
        self.assertNotIn("files", args["Item"])

    def test_duplicate_save_and_delete_are_idempotent(self):
        self.saved_table.put_item.side_effect = ConditionFailed()
        self.assertEqual(self.call("PUT", NOTE)[0], 200)
        self.assertEqual(self.call("DELETE", NOTE)[1], {"saved": False})
        self.saved_table.delete_item.assert_called_with(Key={"userId": "alice", "noteId": NOTE})

    def test_bookmarks_are_per_user(self):
        self.call("GET", NOTE, owner="bob")
        self.saved_table.get_item.assert_called_with(
            Key={"userId": "bob", "noteId": NOTE}, ConsistentRead=True
        )
        self.call("DELETE", NOTE, owner="bob")
        self.saved_table.delete_item.assert_called_with(Key={"userId": "bob", "noteId": NOTE})

    def test_removed_note_returns_no_stale_content(self):
        self.saved_table.query.return_value = {
            "Items": [{"userId": "alice", "noteId": NOTE, "noteOwnerId": "author", "savedAt": "2026-11-16"}]
        }
        self.notes_table.get_item.return_value = {"Item": self.note("private")}
        code, data = self.call("GET")
        self.assertEqual(code, 200)
        self.assertEqual(data["notes"][0], {
            "noteId": NOTE, "available": False, "savedAt": "2026-11-16", "savedCollection": ""
        })
        self.assertNotIn("title", json.dumps(data))
        self.assertNotIn("userId", json.dumps(data))
        self.notes_table.get_item.assert_called_with(
            Key={"userId": "author", "noteId": NOTE}, ConsistentRead=True
        )

    def test_cursor_roundtrip_and_cannot_switch_user(self):
        key = {"userId": "alice", "noteId": NOTE, "savedKey": "2026-11-16#" + NOTE}
        encoded = self.api.encode_cursor(key)
        self.assertEqual(self.api.decode_cursor(encoded, "bob")["userId"], "bob")
        self.assertEqual(self.call("GET", params={"cursor": "invalid!!!"})[0], 400)

    def test_bookmark_collections_are_private_and_validated(self):
        code, data = self.call("PATCH", NOTE, owner="bob", params={"collection": "AWS Certifications"})
        self.assertEqual(code, 200)
        self.assertEqual(data["collection"], "AWS Certifications")
        args = self.saved_table.update_item.call_args.kwargs
        self.assertEqual(args["Key"], {"userId": "bob", "noteId": NOTE})
        self.assertIn("attribute_exists", args["ConditionExpression"])
        self.assertEqual(args["ExpressionAttributeValues"][":name"], "AWS Certifications")
        for name in ("x" * 61, "bad\nname", 42):
            self.assertEqual(self.call("PATCH", NOTE, params={"collection": name})[0], 400)
        self.saved_table.update_item.side_effect = ConditionFailed()
        self.assertEqual(self.call("PATCH", NOTE, params={"collection": "School"})[0], 404)

    def test_collections_return_with_live_and_unavailable_bookmarks(self):
        self.saved_table.query.return_value = {"Items": [
            {"userId": "alice", "noteId": NOTE, "noteOwnerId": "author",
             "savedAt": "2026-11-16", "collection": "Cloud"}
        ]}
        code, body = self.call("GET")
        self.assertEqual(code, 200)
        self.assertEqual(body["notes"][0]["savedCollection"], "Cloud")
        self.notes_table.get_item.return_value = {"Item": self.note("private")}
        code, body = self.call("GET")
        self.assertEqual(body["notes"][0]["savedCollection"], "Cloud")
        self.assertFalse(body["notes"][0]["available"])
        self.assertNotIn("title", json.dumps(body))

    def test_invalid_ids_and_missing_identity(self):
        self.assertEqual(self.call("PUT", "../secret")[0], 400)
        self.assertEqual(self.call("GET", "bad")[0], 400)
        self.assertEqual(self.call("GET", NOTE, owner=None)[0], 401)


if __name__ == "__main__":
    main()
