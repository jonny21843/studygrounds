"""Manual language metadata: create/edit validation and legacy preservation."""
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
import boto3

ROOT = Path(__file__).resolve().parents[1]


def module(path):
    fake = MagicMock()
    with patch.dict(os.environ, {"NOTES_TABLE": "notes"}):
        with patch.object(boto3, "resource") as resource:
            resource.return_value.Table.return_value = fake
            spec = importlib.util.spec_from_file_location("language_" + path.split("/")[3], ROOT / path)
            app = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(app)
    return app, fake


def event(payload, note_id=None):
    return {
        "requestContext": {"authorizer": {"jwt": {"claims": {"sub": "owner"}}}},
        "pathParameters": {"noteId": note_id} if note_id else {},
        "body": json.dumps(payload),
    }


class ManualNoteLanguageTests(unittest.TestCase):
    def setUp(self):
        self.create, self.creation_table = module("backend/functions/notes/create/app.py")
        self.update, self.update_table = module("backend/functions/notes/update/app.py")
        self.update_table.update_item.return_value = {"Attributes": {"noteId": "note-1"}}
        self.base = {
            "title": "My Notes", "subject": "History", "collection": "Europe",
            "description": "Some material",
        }

    def test_create_stores_explicit_language(self):
        response = self.create.lambda_handler(event({**self.base, "language": "es"}), None)
        self.assertEqual(response["statusCode"], 201)
        self.assertEqual(self.creation_table.put_item.call_args.kwargs["Item"]["language"], "es")
        self.assertEqual(json.loads(response["body"])["note"]["language"], "es")

    def test_create_legacy_client_defaults_to_unspecified(self):
        response = self.create.lambda_handler(event(self.base), None)
        self.assertEqual(response["statusCode"], 201)
        self.assertEqual(self.creation_table.put_item.call_args.kwargs["Item"]["language"], "und")

    def test_create_rejects_unsupported_language(self):
        for code in ("not-a-language", "", None, 2, "<script>"):
            self.assertEqual(self.create.lambda_handler(event({**self.base, "language": code}), None)["statusCode"], 400)
        self.creation_table.put_item.assert_not_called()

    def test_update_includes_chosen_language(self):
        self.update.lambda_handler(event({**self.base, "language": "mul"}, "note-1"), None)
        args = self.update_table.update_item.call_args.kwargs
        self.assertEqual(args["ExpressionAttributeValues"][":language"], "mul")
        self.assertIn("#language", args["UpdateExpression"])

    def test_legacy_update_keeps_existing_language(self):
        self.update.lambda_handler(event(self.base, "note-1"), None)
        args = self.update_table.update_item.call_args.kwargs
        self.assertNotIn(":language", args["ExpressionAttributeValues"])
        self.assertNotIn("#language", args["UpdateExpression"])

    def test_update_rejects_invalid_code(self):
        response = self.update.lambda_handler(event({**self.base, "language": "XX"}, "note-1"), None)
        self.assertEqual(response["statusCode"], 400)
        self.update_table.update_item.assert_not_called()


if __name__ == "__main__":
    unittest.main()
