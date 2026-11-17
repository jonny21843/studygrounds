"""Private annotation API regression tests using mocked DynamoDB resources.

Run: python -m unittest discover -s tests -p 'test_private_annotations.py'
Requires boto3; does not call AWS.
"""
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

import boto3

ROOT = Path(__file__).resolve().parents[1]
NOTE_ID = "123e4567-e89b-42d3-a456-426614174000"
ANNOTATION_ID = "123e4567-e89b-42d3-a456-426614174001"


class AnnotationApiTests(unittest.TestCase):
    def setUp(self):
        self.note = {
            "userId": "original-author",
            "noteId": NOTE_ID,
            "visibility": "public",
            "title": "Network security",
            "files": [
                {"fileId": "doc-source", "filename": "notes.docx", "malwareScanStatus": "NO_THREATS_FOUND"},
                {"fileId": "pdf-source", "filename": "handout.pdf", "malwareScanStatus": "NO_THREATS_FOUND"},
                {"fileId": "bad-source", "filename": "unsafe.docx", "malwareScanStatus": "THREATS_FOUND"},
            ],
        }
        self.notes = MagicMock()
        self.activity = MagicMock()
        fake_db = MagicMock()
        fake_db.Table.side_effect = lambda name: self.notes if name == "notes" else self.activity
        with patch.dict(os.environ, {"NOTES_TABLE": "notes", "STUDY_ACTIVITY_TABLE": "activity"}):
            with patch.object(boto3, "resource", return_value=fake_db):
                with patch.object(boto3, "client", return_value=MagicMock()):
                    spec = importlib.util.spec_from_file_location(
                        "study_annotation_test", ROOT / "backend/functions/study/app.py"
                    )
                    self.api = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(self.api)
        self.notes.query.return_value = {"Items": [self.note]}
        self.notes.get_item.return_value = {"Item": self.note}
        self.activity.query.return_value = {"Items": [], "Count": 0}

    def call(self, method, path, payload=None, user="reader"):
        event = {
            "rawPath": path,
            "requestContext": {
                "http": {"method": method},
                "authorizer": {"jwt": {"claims": {"sub": user}}},
            },
            "pathParameters": {"noteId": NOTE_ID},
            "body": json.dumps(payload or {}),
        }
        if path.endswith("/" + ANNOTATION_ID):
            event["pathParameters"]["annotationId"] = ANNOTATION_ID
        result = self.api.lambda_handler(event, None)
        return result["statusCode"], json.loads(result["body"])

    def path(self):
        return "/api/study/annotations/" + NOTE_ID

    def test_auth_and_invalid_identifier(self):
        self.assertEqual(self.call("GET", self.path(), user=None)[0], 401)
        self.assertEqual(self.call("GET", "/api/study/annotations/bad")[0], 200)  # path params determine identity
        event = {
            "rawPath": self.path(),
            "pathParameters": {"noteId": "invalid"},
            "requestContext": {"http": {"method": "GET"}, "authorizer": {"jwt": {"claims": {"sub": "reader"}}}},
        }
        self.assertEqual(self.api.lambda_handler(event, None)["statusCode"], 400)

    def test_create_note_is_account_scoped(self):
        code, result = self.call("POST", self.path(), {
            "kind": "note", "fileId": "pdf-source", "text": "Revisit this diagram."
        }, user="alice")
        self.assertEqual(code, 201)
        self.assertEqual(result["annotation"]["kind"], "note")
        item = self.activity.put_item.call_args.kwargs["Item"]
        self.assertEqual(item["userId"], "alice")
        self.assertTrue(item["recordKey"].startswith("ANNOTATION#" + NOTE_ID + "#"))
        self.assertEqual(item["fileId"], "pdf-source")
        self.assertNotIn("noteOwnerId", item)
        self.assertNotIn("files", item)

    def test_create_highlight_validates_anchor_and_format(self):
        anchor = {"target": 3, "start": 2, "end": 7, "quote": "hello"}
        code, result = self.call("POST", self.path(), {
            "kind": "highlight", "fileId": "doc-source", "text": "",
            "anchor": anchor, "color": "green"
        })
        self.assertEqual(code, 201)
        self.assertEqual(result["annotation"]["anchor"], anchor)
        self.assertEqual(result["annotation"]["color"], "green")
        code, _ = self.call("POST", self.path(), {
            "kind": "highlight", "fileId": "pdf-source", "text": "", "anchor": anchor
        })
        self.assertEqual(code, 400)
        code, _ = self.call("POST", self.path(), {
            "kind": "highlight", "fileId": "doc-source", "text": "",
            "anchor": anchor, "color": "invalid"
        })
        self.assertEqual(code, 400)
        code, _ = self.call("POST", self.path(), {
            "kind": "highlight", "fileId": "doc-source", "text": "",
            "anchor": {**anchor, "quote": "other"}
        })
        self.assertEqual(code, 201)  # server checks shape; browser validates against current preview

    def test_unicode_surrogate_offsets(self):
        # JavaScript text offsets count UTF-16 code units (emoji occupies two).
        anchor = {"target": 0, "start": 0, "end": 2, "quote": "😀"}
        self.assertEqual(self.call("POST", self.path(), {
            "kind": "highlight", "fileId": "doc-source", "text": "", "anchor": anchor
        })[0], 201)

    def test_blocked_and_private_sources_are_not_accessible(self):
        code, _ = self.call("POST", self.path(), {
            "kind": "note", "fileId": "bad-source", "text": "private"
        })
        self.assertEqual(code, 400)
        for state in [
            dict(self.note, visibility="private"),
            dict(self.note, moderationHold=True),
        ]:
            self.notes.get_item.return_value = {"Item": state}
            self.assertEqual(self.call("GET", self.path())[0], 404)
            self.assertEqual(self.call("POST", self.path(), {
                "kind": "note", "fileId": "doc-source", "text": "test"
            })[0], 404)

    def test_list_never_exposes_unsafe_source_entries(self):
        self.activity.query.return_value = {"Items": [
            {
                "annotationId": ANNOTATION_ID, "fileId": "doc-source",
                "kind": "note", "text": "My private exam comment", "createdAt": "2026-11-17"
            },
            {
                "annotationId": "blocked", "fileId": "bad-source",
                "kind": "note", "text": "Should not appear", "createdAt": "2026-11-17"
            },
        ]}
        status, result = self.call("GET", self.path(), user="reader")
        self.assertEqual(status, 200)
        self.assertEqual(len(result["annotations"]), 1)
        self.assertNotIn("Should not appear", json.dumps(result))
        self.assertIn("My private exam comment", json.dumps(result))
        self.assertTrue(self.activity.query.call_args.kwargs["ConsistentRead"])

    def test_deletion_is_scoped_and_possible_after_unpublish(self):
        self.notes.get_item.return_value = {"Item": dict(self.note, visibility="private")}
        code, data = self.call("DELETE", self.path() + "/" + ANNOTATION_ID, user="alice")
        self.assertEqual((code, data["deleted"]), (200, True))
        self.activity.delete_item.assert_called_with(Key={
            "userId": "alice", "recordKey": f"ANNOTATION#{NOTE_ID}#{ANNOTATION_ID}"
        })
        self.notes.get_item.assert_not_called()

    def test_maximum_annotations_enforced(self):
        self.activity.query.return_value = {"Count": 100, "Items": []}
        code, data = self.call("POST", self.path(), {
            "kind": "note", "fileId": "doc-source", "text": "One more"
        })
        self.assertEqual(code, 409)
        self.activity.put_item.assert_not_called()

    def test_text_validation(self):
        for value in ["", " " * 3, "x" * 1001]:
            self.assertEqual(self.call("POST", self.path(), {
                "kind": "note", "fileId": "doc-source", "text": value
            })[0], 400)
        self.assertEqual(self.call("POST", self.path(), {
            "kind": "highlight", "fileId": "doc-source",
            "text": "no text for highlights",
            "anchor": {"target": 0, "start": 0, "end": 1, "quote": "a"},
        })[0], 400)


if __name__ == "__main__":
    unittest.main()
