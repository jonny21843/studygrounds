"""Helpful votes and Explore ranking regression tests.

Run: python -m unittest discover -s tests -p 'test_helpful_votes.py'
Requires boto3; fake DynamoDB resources and clients, no AWS credentials.
"""
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

import boto3

ROOT = Path(__file__).resolve().parents[1]
NOTE_A = "123e4567-e89b-42d3-a456-426614174000"
NOTE_B = "123e4567-e89b-42d3-a456-426614174001"


class HelpfulVotesTests(unittest.TestCase):
    def setUp(self):
        self.note = {
            "userId": "author",
            "noteId": NOTE_A,
            "visibility": "public",
            "files": [{"filename": "study.pdf", "malwareScanStatus": "NO_THREATS_FOUND"}],
            "helpfulCount": 3,
        }
        self.note_table = MagicMock()
        self.vote_table = MagicMock()
        self.preferences_table = MagicMock()
        self.ddb = MagicMock()
        self.note_table.query.return_value = {"Items": [self.note]}
        self.note_table.get_item.return_value = {"Item": self.note}
        self.vote_table.get_item.return_value = {}
        self.ddb.resource.return_value.Table.side_effect = (
            lambda name: self.note_table if name == "notes" else self.vote_table if name == "votes" else self.preferences_table
        )
        with patch.dict(os.environ, {"NOTES_TABLE": "notes", "HELPFUL_VOTES_TABLE": "votes", "PREFERENCES_TABLE": "preferences"}):
            with patch.object(boto3, "resource", self.ddb.resource):
                with patch.object(boto3, "client", self.ddb.client):
                    spec = importlib.util.spec_from_file_location(
                        "helpful_votes_test", ROOT / "backend/functions/helpful/app.py"
                    )
                    self.api = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(self.api)

    def call(self, method="GET", user="reader", note=NOTE_A):
        event = {
            "pathParameters": {"noteId": note},
            "requestContext": {
                "http": {"method": method},
                "authorizer": {"jwt": {"claims": {"sub": user}}},
            },
        }
        result = self.api.lambda_handler(event, None)
        return result["statusCode"], json.loads(result["body"])

    def test_auth_validation_and_self_vote_rejected(self):
        self.assertEqual(self.call(user=None)[0], 401)
        self.assertEqual(self.call(note="wrong")[0], 400)
        self.assertEqual(self.call("PUT", user="author")[0], 403)
        self.ddb.client.return_value.transact_write_items.assert_not_called()

    def test_vote_add_transaction_has_atomic_counter(self):
        status, result = self.call("PUT")
        self.assertEqual(status, 200)
        txn = self.ddb.client.return_value.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(len(txn), 2)
        self.assertEqual(txn[0]["Put"]["TableName"], "votes")
        self.assertEqual(txn[0]["Put"]["Item"]["userId"], {"S": "reader"})
        self.assertIn("attribute_not_exists", txn[0]["Put"]["ConditionExpression"])
        self.assertEqual(txn[1]["Update"]["TableName"], "notes")
        self.assertEqual(txn[1]["Update"]["ExpressionAttributeValues"][":delta"], {"N": "1"})
        self.assertIn("moderationHold", txn[1]["Update"]["ConditionExpression"])

    def test_helpful_notification_is_private_and_deduplicated(self):
        self.note["title"] = "Private title isn't needed"
        status, _ = self.call("PUT")
        self.assertEqual(status, 200)
        item = self.preferences_table.put_item.call_args.kwargs["Item"]
        self.assertEqual(item["pk"], "USER#author")
        self.assertEqual(item["type"], "helpful")
        self.assertIn("HELPFUL#", item["sk"])
        self.assertNotIn("reader", item["sk"])
        self.assertNotIn("reader", item["message"])
        self.assertNotIn(self.note["title"], item["message"])
        self.assertIn("attribute_not_exists", self.preferences_table.put_item.call_args.kwargs["ConditionExpression"])
        self.preferences_table.put_item.reset_mock()
        self.vote_table.get_item.return_value = {"Item":{"noteId":NOTE_A}}
        self.call("PUT")
        self.preferences_table.put_item.assert_not_called()

    def test_vote_unmark_does_not_send_notification(self):
        self.vote_table.get_item.return_value = {"Item":{"noteId":NOTE_A}}
        self.call("DELETE")
        self.preferences_table.put_item.assert_not_called()

    def test_duplicate_put_does_not_increment(self):
        self.vote_table.get_item.return_value = {"Item": {"noteId": NOTE_A}}
        status, result = self.call("PUT")
        self.assertEqual((status, result["helpful"]), (200, True))
        self.ddb.client.return_value.transact_write_items.assert_not_called()

    def test_undo_vote_is_atomic_and_idempotent(self):
        self.vote_table.get_item.return_value = {"Item": {"noteId": NOTE_A}}
        self.call("DELETE")
        txn = self.ddb.client.return_value.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(txn[0]["Delete"]["Key"]["userId"], {"S": "reader"})
        self.assertEqual(txn[1]["Update"]["ExpressionAttributeValues"][":delta"], {"N": "-1"})
        self.ddb.client.return_value.transact_write_items.reset_mock()
        self.vote_table.get_item.return_value = {}
        self.call("DELETE")
        self.ddb.client.return_value.transact_write_items.assert_not_called()

    def test_voter_identity_isolation(self):
        self.call("PUT", user="different-reader")
        txn = self.ddb.client.return_value.transact_write_items.call_args.kwargs["TransactItems"]
        self.assertEqual(txn[0]["Put"]["Item"]["userId"], {"S": "different-reader"})

    def test_private_held_and_unsafe_not_votable(self):
        for key, value in [
            ("visibility", "private"),
            ("moderationHold", True),
            ("files", [{"malwareScanStatus": "THREATS_FOUND"}]),
        ]:
            changed = dict(self.note, **{key: value})
            self.note_table.get_item.return_value = {"Item": changed}
            self.assertEqual(self.call("PUT")[0], 404)
        self.ddb.client.return_value.transact_write_items.assert_not_called()

    def test_public_status_does_not_expose_voter_id(self):
        status, result = self.call()
        self.assertEqual(status, 200)
        self.assertEqual(result, {"helpful": False, "helpfulCount": 3})
        self.assertNotIn("reader", json.dumps(result))


class ExploreMostHelpfulTests(unittest.TestCase):
    def setUp(self):
        self.table = MagicMock()
        self.ddb = MagicMock()
        self.ddb.resource.return_value.Table.return_value = self.table
        with patch.dict(os.environ, {"NOTES_TABLE": "notes"}):
            with patch.object(boto3, "resource", self.ddb.resource):
                spec = importlib.util.spec_from_file_location(
                    "helpful_list_test", ROOT / "backend/functions/public/list/app.py"
                )
                self.api = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(self.api)
        self.table.scan.return_value = {
            "Items": [
                self.note("older-popular", 8, "2026-11-01"),
                self.note("newer-popular", 8, "2026-11-02"),
                self.note("no-votes", 0, "2026-11-03"),
                self.note("private", 100, "2026-11-04", visibility="private"),
                dict(self.note("moderation-held", 1000, "2026-11-05"), moderationHold=True),
            ]
        }

    @staticmethod
    def note(note_id, count, published, visibility="public"):
        return {
            "noteId": note_id,
            "userId": "author",
            "visibility": visibility,
            "title": note_id,
            "publishedAt": published,
            "helpfulCount": count,
            "files": [{"malwareScanStatus": "NO_THREATS_FOUND"}],
        }

    def test_helpful_sort_before_pagination(self):
        result = self.api.lambda_handler(
            {"queryStringParameters": {"sort": "helpful", "pageSize": "1", "page": "1"}}, None
        )
        body = json.loads(result["body"])
        self.assertEqual(body["total"], 3)
        self.assertEqual(body["notes"][0]["noteId"], "newer-popular")
        result2 = self.api.lambda_handler(
            {"queryStringParameters": {"sort": "helpful", "pageSize": "1", "page": "2"}}, None
        )
        self.assertEqual(json.loads(result2["body"])["notes"][0]["noteId"], "older-popular")

    def test_default_remains_newest(self):
        result = self.api.lambda_handler({"queryStringParameters": {}}, None)
        body = json.loads(result["body"])
        self.assertEqual(body["notes"][0]["noteId"], "no-votes")
        self.assertEqual(body["notes"][0]["helpfulCount"], 0)


class TrendingExploreTests(ExploreMostHelpfulTests):
    def setUp(self):
        super().setUp()
        from datetime import datetime, timezone, timedelta
        self.now = datetime.now(timezone.utc)
        self.days_ago = lambda days: (self.now - timedelta(days=days)).isoformat()

    def test_recent_engagement_outranks_older_lifetime_views(self):
        fresh = dict(self.note("fresh", 2, self.days_ago(1)), viewCount=9)
        old = dict(self.note("old", 5, self.days_ago(100)), viewCount=2000)
        self.assertGreater(
            self.api.trending_score(fresh, self.now),
            self.api.trending_score(old, self.now),
        )

    def test_helpful_votes_outweigh_a_few_extra_views(self):
        helpful = dict(self.note("helpful", 2, self.days_ago(3)), viewCount=5)
        viewed = dict(self.note("viewed", 0, self.days_ago(3)), viewCount=100)
        self.assertGreater(
            self.api.trending_score(helpful, self.now),
            self.api.trending_score(viewed, self.now),
        )

    def test_age_decay_and_malformed_dates(self):
        recent = self.note("recent", 3, self.days_ago(2))
        old = self.note("old", 3, self.days_ago(60))
        self.assertGreater(
            self.api.trending_score(recent, self.now),
            self.api.trending_score(old, self.now),
        )
        self.assertEqual(self.api.trending_score({"publishedAt": "unknown"}, self.now), 0)
        self.assertEqual(self.api.trending_score({}, self.now), 0)
        self.assertGreaterEqual(self.api.trending_score(
            dict(self.note("future", 1, self.days_ago(-1)), viewCount=0), self.now
        ), 0)

    def test_trending_filters_and_sorts_before_pagination(self):
        self.table.scan.return_value = {"Items": [
            dict(self.note("older", 2, self.days_ago(80)), subject="Technology", viewCount=100),
            dict(self.note("fresh", 1, self.days_ago(1)), subject="Technology", viewCount=6),
            dict(self.note("fresh-other-topic", 4, self.days_ago(1)), subject="History", viewCount=6),
            dict(self.note("private", 100, self.days_ago(0), visibility="private"), viewCount=999),
            dict(self.note("held", 100, self.days_ago(0)), moderationHold=True, viewCount=999),
        ]}
        result = self.api.lambda_handler({
            "queryStringParameters": {
                "sort": "trending", "subject": "Technology", "pageSize": "1", "page": "1"
            }
        }, None)
        body = json.loads(result["body"])
        self.assertEqual(body["total"], 2)
        self.assertEqual(body["notes"][0]["noteId"], "fresh")
        result = self.api.lambda_handler({
            "queryStringParameters": {
                "sort": "trending", "subject": "Technology", "pageSize": "1", "page": "2"
            }
        }, None)
        self.assertEqual(json.loads(result["body"])["notes"][0]["noteId"], "older")

    def test_trending_uses_stable_tie_breaks(self):
        self.table.scan.return_value = {"Items": [
            dict(self.note("a", 1, self.days_ago(2)), viewCount=4),
            dict(self.note("b", 1, self.days_ago(2)), viewCount=4),
        ]}
        result = self.api.lambda_handler(
            {"queryStringParameters": {"sort": "trending"}}, None
        )
        names = [note["noteId"] for note in json.loads(result["body"])["notes"]]
        self.assertEqual(names, ["b", "a"])


if __name__ == "__main__":
    unittest.main()
