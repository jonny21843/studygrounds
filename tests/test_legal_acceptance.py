"""Legal acceptance security and versioning regressions."""
import importlib.util
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "layers" / "legal" / "python"))
from legal_guard import require_legal_acceptance

ENV = {"LEGAL_PREFERENCES_TABLE": "test-prefs", "LEGAL_TERMS_VERSION": "1.1", "LEGAL_PRIVACY_VERSION": "1.1", "PREFERENCES_TABLE": "test-prefs", "LEGAL_ENFORCEMENT_ENABLED": "true"}

def request(method="POST", sub="user-123", body=None):
    event = {"requestContext": {"http": {"method": method}, "authorizer": {"jwt": {"claims": {"sub": sub}}}}}
    if body is not None:
        event["body"] = json.dumps(body)
    return event

def response_json(result):
    return json.loads(result["body"])

class GuardTests(unittest.TestCase):
    def test_get_does_not_require_acceptance(self):
        with patch.dict(os.environ, ENV):
            self.assertIsNone(require_legal_acceptance(request("GET")))

    def test_missing_claims_are_rejected_on_write(self):
        event = request()
        event["requestContext"]["authorizer"]["jwt"]["claims"] = {}
        with patch.dict(os.environ, ENV):
            self.assertEqual(require_legal_acceptance(event)["statusCode"], 401)

    def test_missing_or_outdated_acceptance_blocks_direct_write(self):
        store = MagicMock()
        store.get_item.return_value = {}
        resource = MagicMock()
        resource.Table.return_value = store
        with patch.dict(os.environ, ENV), patch("legal_guard.boto3.resource", return_value=resource):
            response = require_legal_acceptance(request())
        self.assertEqual(response["statusCode"], 428)
        self.assertEqual(response_json(response)["code"], "LEGAL_ACCEPTANCE_REQUIRED")
        self.assertEqual(store.get_item.call_args.kwargs["ConsistentRead"], True)

    def test_both_documents_required_and_bound_to_user(self):
        store = MagicMock()
        store.get_item.side_effect = [{"Item": {"acceptedAt": "now"}}, {"Item": {"acceptedAt": "now"}}]
        resource = MagicMock()
        resource.Table.return_value = store
        with patch.dict(os.environ, ENV), patch("legal_guard.boto3.resource", return_value=resource):
            self.assertIsNone(require_legal_acceptance(request(sub="different-user")))
        keys = [call.kwargs["Key"] for call in store.get_item.call_args_list]
        self.assertEqual(keys, [
            {"pk": "USER#different-user", "sk": "LEGAL#terms#1.1"},
            {"pk": "USER#different-user", "sk": "LEGAL#privacy#1.1"},
        ])

class AcceptanceEndpointTests(unittest.TestCase):
    def setUp(self):
        self.table = MagicMock()
        self.resource = MagicMock()
        self.resource.Table.return_value = self.table
        self.env = patch.dict(os.environ, ENV)
        self.mock_resource = patch("boto3.resource", return_value=self.resource)
        self.env.start()
        self.mock_resource.start()
        spec = importlib.util.spec_from_file_location("studygrounds_legal_handler", ROOT / "backend" / "functions" / "legal" / "app.py")
        self.handler = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.handler)

    def tearDown(self):
        self.mock_resource.stop()
        self.env.stop()

    def valid_payload(self):
        return {"termsVersion": "1.1", "privacyVersion": "1.1", "agreeToTerms": True, "acknowledgePrivacy": True, "age13OrOlder": True}

    def test_get_returns_required_when_no_acceptance(self):
        self.table.get_item.return_value = {}
        result = self.handler.lambda_handler(request("GET"), None)
        self.assertEqual(result["statusCode"], 200)
        self.assertTrue(response_json(result)["required"])

    def test_valid_acceptance_is_immutable_per_version(self):
        result = self.handler.lambda_handler(request(body=self.valid_payload()), None)
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(self.table.put_item.call_count, 2)
        keys = [call.kwargs["Item"]["sk"] for call in self.table.put_item.call_args_list]
        self.assertEqual(keys, ["LEGAL#terms#1.1", "LEGAL#privacy#1.1"])
        self.assertTrue(self.table.put_item.call_args_list[0].kwargs["Item"]["age13OrOlderConfirmed"])
        for call in self.table.put_item.call_args_list:
            self.assertIn("attribute_not_exists", call.kwargs["ConditionExpression"])
            self.assertEqual(call.kwargs["Item"]["pk"], "USER#user-123")

    def test_stale_version_is_rejected(self):
        payload = self.valid_payload()
        payload["termsVersion"] = "0.9"
        result = self.handler.lambda_handler(request(body=payload), None)
        self.assertEqual(result["statusCode"], 409)
        self.table.put_item.assert_not_called()

    def test_no_checked_confirmation_is_rejected(self):
        payload = self.valid_payload()
        payload["acknowledgePrivacy"] = False
        result = self.handler.lambda_handler(request(body=payload), None)
        self.assertEqual(result["statusCode"], 400)
        self.table.put_item.assert_not_called()

    def test_under_13_is_rejected(self):
        payload = self.valid_payload()
        payload["age13OrOlder"] = False
        result = self.handler.lambda_handler(request(body=payload), None)
        self.assertEqual(result["statusCode"], 403)
        self.table.put_item.assert_not_called()

    def test_unknown_fields_and_imposed_identity_are_rejected(self):
        payload = self.valid_payload()
        payload["userId"] = "victim"
        result = self.handler.lambda_handler(request(body=payload), None)
        self.assertEqual(result["statusCode"], 400)
        self.table.put_item.assert_not_called()

if __name__ == "__main__":
    unittest.main()
