"""Account deletion protections: explicit owner intent, queueing and idempotent cleanup."""
import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
ENV = {
    "PREFERENCES_TABLE": "prefs", "DELETION_QUEUE_URL": "https://sqs.test/deletion",
    "NOTES_TABLE": "notes", "SAVED_NOTES_TABLE": "saved", "HELPFUL_VOTES_TABLE": "votes",
    "STUDY_ACTIVITY_TABLE": "activity", "SECURITY_TABLE": "security",
    "FEEDBACK_TABLE": "feedback", "REPORTS_TABLE": "reports",
    "NOTES_BUCKET": "test-uploads", "COGNITO_USER_POOL_ID": "test-pool",
}

def event(method="POST", sub="my-user", payload=None):
    return {
        "requestContext": {"http": {"method": method},
                           "authorizer": {"jwt": {"claims": {
                               "sub": sub, "username": "cognito-my-user",
                           }}}},
        "body": json.dumps(payload or {}),
    }

class DeletionRequestTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, ENV)
        self.env.start()
        self.table = MagicMock()
        self.table.get_item.return_value = {}
        self.queue = MagicMock()
        self.cognito = MagicMock()
        resource = MagicMock()
        resource.Table.return_value = self.table
        self.boto = patch("boto3.resource", return_value=resource)
        self.client = patch("boto3.client", side_effect=lambda name: self.queue if name == "sqs" else self.cognito)
        self.boto.start()
        self.client.start()
        spec = importlib.util.spec_from_file_location(
            "account_deletion_request", ROOT / "backend/functions/account/deletion/app.py")
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def tearDown(self):
        self.client.stop()
        self.boto.stop()
        self.env.stop()

    def test_rejects_unconfirmed_request(self):
        result = self.module.lambda_handler(event(payload={"confirmation": "delete"}), None)
        self.assertEqual(result["statusCode"], 400)
        self.queue.send_message.assert_not_called()

    def test_queue_identity_from_claims_only(self):
        result = self.module.lambda_handler(
            event(payload={"confirmation": "DELETE MY ACCOUNT"}), None)
        self.assertEqual(result["statusCode"], 202)
        self.assertEqual(self.table.put_item.call_args.kwargs["Item"]["pk"], "USER#my-user")
        body = json.loads(self.queue.send_message.call_args.kwargs["MessageBody"])
        self.assertEqual(body["sub"], "my-user")
        self.assertNotIn("username", body)
        self.assertGreaterEqual(self.queue.send_message.call_args.kwargs["DelaySeconds"], 300)
        self.cognito.admin_disable_user.assert_called_once_with(
            UserPoolId="test-pool", Username="cognito-my-user")

    def test_existing_pending_request_is_idempotent(self):
        self.table.get_item.return_value = {"Item": {"status": "PENDING"}}
        result = self.module.lambda_handler(
            event(payload={"confirmation": "DELETE MY ACCOUNT"}), None)
        self.assertEqual(result["statusCode"], 202)
        self.queue.send_message.assert_not_called()
        self.cognito.admin_disable_user.assert_not_called()

    def test_disable_failure_still_leaves_deletion_queued(self):
        from botocore.exceptions import ClientError
        self.cognito.admin_disable_user.side_effect = ClientError(
            {"Error": {"Code": "AccessDeniedException", "Message": "no permission"}}, "AdminDisableUser"
        )
        result = self.module.lambda_handler(event(payload={"confirmation": "DELETE MY ACCOUNT"}), None)
        self.assertEqual(result["statusCode"], 202)
        self.assertFalse(json.loads(result["body"])["accessRestricted"])
        self.queue.send_message.assert_called_once()

    def test_missing_identity_does_not_delete_another_user(self):
        e = event(payload={"confirmation": "DELETE MY ACCOUNT"})
        e["requestContext"]["authorizer"]["jwt"]["claims"]["sub"] = ""
        self.assertEqual(self.module.lambda_handler(e, None)["statusCode"], 401)

class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, ENV)
        self.env.start()
        self.resource = MagicMock()
        self.tables = {name: MagicMock() for name in ("notes", "saved", "votes", "activity", "prefs", "security", "feedback", "reports")}
        self.resource.Table.side_effect = lambda name: self.tables[name]
        self.s3 = MagicMock()
        self.cognito = MagicMock()
        self.boto = patch("boto3.resource", return_value=self.resource)
        self.client = patch("boto3.client", side_effect=lambda name: self.s3 if name == "s3" else self.cognito)
        self.boto.start()
        self.client.start()
        spec = importlib.util.spec_from_file_location(
            "account_deletion_worker", ROOT / "backend/functions/account/deletion_worker/app.py")
        self.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.worker)

    def tearDown(self):
        self.client.stop()
        self.boto.stop()
        self.env.stop()

    def test_unknown_request_does_not_delete_anything(self):
        self.tables["prefs"].get_item.return_value = {}
        self.worker.remove_account("my-user", "request-id")
        self.cognito.admin_delete_user.assert_not_called()

    def test_removes_account_after_all_cleanup_stages(self):
        self.tables["prefs"].get_item.return_value = {
            "Item": {"requestId": "request-id", "username": "cognito-my-user"}}
        for name in ("notes", "saved", "votes", "activity", "prefs", "security"):
            self.tables[name].query.return_value = {"Items": []}
        self.s3.list_objects_v2.return_value = {"Contents": []}
        self.tables["feedback"].scan.return_value = {"Items": []}
        self.tables["reports"].scan.return_value = {"Items": []}
        self.worker.remove_account("my-user", "request-id")
        self.cognito.admin_delete_user.assert_called_once_with(
            UserPoolId="test-pool", Username="cognito-my-user")
        self.tables["prefs"].delete_item.assert_called_once_with(
            Key={"pk": "USER#my-user", "sk": "ACCOUNT#DELETION"})

    def test_deletes_all_pages_of_partition(self):
        table = MagicMock()
        table.query.side_effect = [
            {"Items": [{"userId": "u", "noteId": "a"}]},
            {"Items": [{"userId": "u", "noteId": "b"}]},
            {"Items": []},
        ]
        self.worker.remove_partition(table, "userId", "noteId", "u")
        self.assertEqual(table.query.call_count, 3)
        self.assertEqual(table.batch_writer.return_value.__enter__.return_value.delete_item.call_count, 2)

    def test_malformed_event_rejected(self):
        with self.assertRaises(ValueError):
            self.worker.lambda_handler({"Records": [{"body": "{}"}]}, None)

if __name__ == "__main__":
    unittest.main()
