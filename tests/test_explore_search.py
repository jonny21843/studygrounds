"""Explore search ranking, language-safe matching and discovery privacy."""
import importlib.util
import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch
import unittest

import boto3


def make_note(note_id, title, **kwargs):
    return {
        "noteId": note_id,
        "userId": "contributor",
        "visibility": "public",
        "title": title,
        "subject": "Technology",
        "collection": "Networking",
        "description": "Notes about computing",
        "publicAuthor": "Alex R.",
        "publishedAt": "2026-11-19T09:00:00Z",
        "helpfulCount": 0,
        "files": [{"malwareScanStatus": "NO_THREATS_FOUND"}],
        **kwargs,
    }


class ExploreSearchTests(unittest.TestCase):
    def setUp(self):
        table = MagicMock()
        self.table = table
        with patch.dict(os.environ, {"NOTES_TABLE": "fake"}):
            with patch.object(boto3, "resource") as resource:
                resource.return_value.Table.return_value = table
                spec = importlib.util.spec_from_file_location(
                    "explore_list_search", Path(__file__).resolve().parents[1] / "backend/functions/public/list/app.py"
                )
                self.api = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(self.api)

    def search(self, query, sort="relevance"):
        result = self.api.lambda_handler({"queryStringParameters":{"q":query,"sort":sort}}, None)
        return result["statusCode"], json.loads(result["body"])

    def test_title_phrase_outweighs_description_or_author(self):
        self.table.scan.return_value = {"Items":[
            make_note("title", "AWS Cloud Computing"),
            make_note("description", "Getting started", description="AWS cloud computing guide"),
            make_note("author", "Welcome", publicAuthor="AWS Cloud Computing"),
        ]}
        code, body = self.search("aws cloud")
        self.assertEqual(code, 200)
        self.assertEqual(body["notes"][0]["noteId"], "title")
        self.assertEqual(body["total"], 3)

    def test_accent_punctuation_and_contributor_search(self):
        self.table.scan.return_value = {"Items":[
            make_note("spanish", "Introducción a Linux"),
            make_note("author", "Basics", publicAuthor="José M."),
        ]}
        self.assertEqual(self.search("introduccion linux")[1]["notes"][0]["noteId"], "spanish")
        self.assertEqual(self.search("jose")[1]["notes"][0]["noteId"], "author")

    def test_all_keywords_required_across_fields(self):
        self.table.scan.return_value = {"Items":[make_note("both", "Linux fundamentals"), make_note("other", "Biology", subject="Science", collection="Health")]}
        self.assertEqual(self.search("linux technology")[1]["total"], 1)
        self.assertEqual(self.search("linux impossible")[1]["total"], 0)

    def test_private_moderated_and_unsafe_do_not_appear(self):
        safe = make_note("safe", "Linux guide")
        private = dict(make_note("private", "Linux guide"), visibility="private")
        held = dict(make_note("held", "Linux guide"), moderationHold=True)
        unsafe = dict(make_note("unsafe", "Linux guide"), files=[{"malwareScanStatus":"THREATS_FOUND"}])
        self.table.scan.return_value = {"Items":[safe, private, held, unsafe]}
        self.assertEqual([n["noteId"] for n in self.search("linux")[1]["notes"]], ["safe"])

    def test_sort_validation_and_empty_relevance_fallback(self):
        self.table.scan.return_value = {"Items":[make_note("one", "Linux")]}
        self.assertEqual(self.search("linux", sort="nonsense")[0], 400)
        self.assertEqual(self.search("", sort="relevance")[1]["total"], 1)


if __name__ == "__main__":
    unittest.main()
