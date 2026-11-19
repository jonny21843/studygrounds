"""Notification inbox privacy, deduplication and moderation action tests."""
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
import boto3

ROOT = Path(__file__).resolve().parents[1]


def module(path, name, env):
    resource = MagicMock()
    fake = MagicMock()
    resource.Table.return_value = fake
    with patch.dict(os.environ, env), patch.object(boto3, "resource", return_value=resource):
        spec = importlib.util.spec_from_file_location(name, ROOT / path)
        instance = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(instance)
    return instance, fake


class NotificationApiTests(unittest.TestCase):
    def setUp(self):
        self.api, self.table = module("backend/functions/notifications/app.py", "notif_test", {"PREFERENCES_TABLE":"prefs"})

    def event(self, method="GET", body=None, user="recipient"):
        return {
            "requestContext": {"authorizer":{"jwt":{"claims":{"sub":user}}}, "http":{"method":method}},
            "body": json.dumps(body) if body is not None else "",
        }

    def test_no_auth_is_401_without_data_read(self):
        response = self.api.lambda_handler(self.event(user=""), None)
        self.assertEqual(response["statusCode"], 401)
        self.table.query.assert_not_called()

    def test_private_list_sorted_and_unread_count(self):
        self.table.query.return_value = {"Items":[
            {"pk":"USER#recipient","sk":"NOTICE#HELPFUL#a#opaque","type":"helpful","message":"Helpful!","createdAt":"2026-11-10","read":False},
            {"pk":"USER#recipient","sk":"NOTICE#MODERATION#report#unpublish","type":"moderation","message":"Removed","createdAt":"2026-11-11","read":True},
        ]}
        response = self.api.lambda_handler(self.event(), None)
        body = json.loads(response["body"])
        self.assertEqual(body["unreadCount"], 1)
        self.assertEqual(body["notifications"][0]["message"], "Removed")
        self.assertNotIn("recipient", json.dumps(body))
        condition = self.table.query.call_args.kwargs["KeyConditionExpression"]
        self.assertEqual(
            condition.get_expression()["values"][0].get_expression()["values"][1],
            "USER#recipient",
        )

    def test_read_is_scoped_to_authenticated_user(self):
        response = self.api.lambda_handler(self.event("PATCH", {"id":"HELPFUL#a#opaque"}), None)
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(self.table.update_item.call_args.kwargs["Key"], {
            "pk":"USER#recipient","sk":"NOTICE#HELPFUL#a#opaque",
        })
        self.assertIn("attribute_exists", self.table.update_item.call_args.kwargs["ConditionExpression"])

    def test_cannot_read_arbitrary_keys(self):
        for bad in ("PUBLIC_PROFILE","../preferences","MODERATION",123,""):
            self.assertEqual(self.api.lambda_handler(self.event("PATCH", {"id":bad}),None)["statusCode"],400)
        self.table.update_item.assert_not_called()

    def test_mark_recent_read_limited_to_inbox(self):
        self.table.query.return_value = {"Items":[
            {"pk":"USER#recipient","sk":"NOTICE#HELPFUL#one","read":False},
            {"pk":"USER#recipient","sk":"NOTICE#HELPFUL#two","read":True},
        ]}
        response = self.api.lambda_handler(self.event("PATCH", {"all":True}), None)
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(self.table.update_item.call_count, 1)


class ModerationNotificationTests(unittest.TestCase):
    def setUp(self):
        self.api, self.table = module("backend/functions/admin/moderation/app.py", "moderation_notif_test",
            {"NOTES_TABLE":"notes", "REPORTS_TABLE":"reports", "PREFERENCES_TABLE":"prefs","ADMIN_EMAILS":"admin@example.com"})

    def test_moderation_notice_goes_only_to_note_owner(self):
        self.api.notify_moderation({"userId":"owner","noteId":"note-x"},"report-1","unpublish")
        item = self.table.put_item.call_args.kwargs["Item"]
        self.assertEqual(item["pk"], "USER#owner")
        self.assertEqual(item["type"], "moderation")
        self.assertIn("removed by moderation", item["message"])
        self.assertIn("attribute_not_exists", self.table.put_item.call_args.kwargs["ConditionExpression"])
        self.table.put_item.reset_mock()
        self.api.notify_moderation({"userId":"owner","noteId":"note-x"},"report-1","restore")
        restored = self.table.put_item.call_args.kwargs["Item"]
        self.assertEqual(restored["type"], "restored")
        self.assertIn("remains private", restored["message"])


if __name__=="__main__":
    unittest.main()
