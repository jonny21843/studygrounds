"""Self-contained unit checks for the public contributor Lambda.

Run locally: python -m unittest discover -s tests -p 'test_public_contributor.py'
Requires Python 3.12 and boto3 (or any AWS Lambda development environment).
"""
import importlib.util
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

APP_FILE = Path(__file__).resolve().parents[1] / "backend/functions/public/contributor/app.py"


class FakeTable:
    def __init__(self, items):
        self.items = items
        self.scan_calls = 0

    def get_item(self, **kwargs):
        return {"Item": {}}

    def scan(self, **kwargs):
        self.scan_calls += 1
        return {"Items": self.items}


class PublicContributorTests(unittest.TestCase):
    def setUp(self):
        self.table = FakeTable([])
        self.aws = MagicMock()
        self.aws.resource.return_value.Table.return_value = self.table
        with patch.dict(sys.modules, {"boto3": self.aws}):
            with patch.dict(os.environ, {"NOTES_TABLE": "test-notes"}):
                spec = importlib.util.spec_from_file_location("public_contributor_test", APP_FILE)
                self.module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(self.module)
        self.alice_id = self.module.contributor_id("alice-sub")
        self.bob_id = self.module.contributor_id("bob-sub")

    def note(self, owner, title, visibility="public", scan=None, author="Same Name"):
        return {
            "userId": owner, "noteId": title, "title": title,
            "publicAuthor": author, "description": "test",
            "subject": "Technology", "collection": "Linux",
            "publishedAt": "2026-11-16T00:00:00Z",
            "visibility": visibility,
            "files": [{"filename": "a.pdf", "malwareScanStatus": scan}],
        }

    def get(self, contributor_id, page=None):
        event = {"pathParameters": {"contributorId": contributor_id}}
        if page is not None:
            event["queryStringParameters"] = {"page": str(page)}
        resp = self.module.lambda_handler(event, None)
        return resp["statusCode"], json.loads(resp["body"])

    def test_public_id_is_stable_not_raw_or_name_based(self):
        self.assertEqual(self.alice_id, self.module.contributor_id("alice-sub"))
        self.assertNotEqual(self.alice_id, self.bob_id)
        self.assertNotIn("alice", self.alice_id)

    def test_private_moderated_and_unsafe_are_excluded(self):
        self.table.items = [
            self.note("alice-sub", "published", scan="NO_THREATS_FOUND"),
            self.note("alice-sub", "private", visibility="private"),
            self.note("alice-sub", "blocked", visibility="private"),
            self.note("alice-sub", "unsafe", scan="THREATS_FOUND"),
            self.note("bob-sub", "other-user", author="Same Name"),
        ]
        status, body = self.get(self.alice_id)
        self.assertEqual(status, 200)
        self.assertEqual(body["contributor"]["contributionCount"], 1)
        self.assertEqual([item["title"] for item in body["notes"]], ["published"])
        self.assertNotIn("userId", json.dumps(body))
        self.assertNotIn("alice-sub", json.dumps(body))
        self.assertNotIn("bob-sub", json.dumps(body))
        self.assertNotIn("files", body["notes"][0])
        self.assertEqual(body["contributor"]["subjects"], ["Technology"])


    def test_public_profile_bio_avatar_and_helpful_totals(self):
        self.table.items = [
            {**self.note("alice-sub", "One"), "helpfulCount": 6},
            {**self.note("alice-sub", "Two"), "helpfulCount": 4},
        ]
        self.table.get_item = lambda **kwargs: {
            "Item": {"bio": "Biology learner.", "avatarStyle": "emerald"}
        }
        status, body = self.get(self.alice_id)
        self.assertEqual(status, 200)
        self.assertEqual(body["contributor"]["bio"], "Biology learner.")
        self.assertEqual(body["contributor"]["avatarStyle"], "emerald")
        self.assertEqual(body["contributor"]["helpfulCount"], 10)
        self.assertNotIn("alice-sub", json.dumps(body))

    def test_unknown_id_and_no_public_notes_are_404(self):
        self.assertEqual(self.get("not-a-valid-id")[0], 404)
        self.table.items = [self.note("alice-sub", "hidden", visibility="private")]
        self.assertEqual(self.get(self.alice_id)[0], 404)

    def test_pagination_and_counts(self):
        self.table.items = [self.note("alice-sub", str(i)) for i in range(15)]
        status, body = self.get(self.alice_id, page=2)
        self.assertEqual(status, 200)
        self.assertEqual(body["contributor"]["contributionCount"], 15)
        self.assertEqual(body["totalPages"], 2)
        self.assertEqual(body["page"], 2)
        self.assertEqual(len(body["notes"]), 3)
        self.assertEqual(self.get(self.alice_id, page="bad")[0], 400)


if __name__ == "__main__":
    unittest.main()
