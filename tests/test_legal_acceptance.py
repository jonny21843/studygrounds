"""Legal acceptance security and versioning regressions."""
import importlib.util
import json
import os
import sys
import unittest
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "layers" / "legal" / "python"))
from legal_guard import require_legal_acceptance

ENV = {"LEGAL_PREFERENCES_TABLE": "test-prefs", "LEGAL_TERMS_VERSION": "1.2", "LEGAL_PRIVACY_VERSION": "1.2", "PREFERENCES_TABLE": "test-prefs", "LEGAL_ENFORCEMENT_ENABLED": "true"}

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

    def test_pending_deletion_blocks_writes(self):
        store = MagicMock()
        store.get_item.return_value = {"Item": {"status": "PENDING"}}
        resource = MagicMock()
        resource.Table.return_value = store
        with patch.dict(os.environ, ENV), patch("legal_guard.boto3.resource", return_value=resource):
            response = require_legal_acceptance(request())
        self.assertEqual(response["statusCode"], 423)
        self.assertEqual(response_json(response)["code"], "ACCOUNT_DELETION_PENDING")

    def test_both_documents_required_and_bound_to_user(self):
        store = MagicMock()
        store.get_item.side_effect = [{}, {"Item": {"acceptedAt": "now"}}, {"Item": {"acceptedAt": "now"}}]
        resource = MagicMock()
        resource.Table.return_value = store
        with patch.dict(os.environ, ENV), patch("legal_guard.boto3.resource", return_value=resource):
            self.assertIsNone(require_legal_acceptance(request(sub="different-user")))
        keys = [call.kwargs["Key"] for call in store.get_item.call_args_list]
        self.assertEqual(keys, [
            {"pk": "USER#different-user", "sk": "ACCOUNT#DELETION"},
            {"pk": "USER#different-user", "sk": "LEGAL#terms#1.2"},
            {"pk": "USER#different-user", "sk": "LEGAL#privacy#1.2"},
        ])

class AcceptanceEndpointTests(unittest.TestCase):
    def setUp(self):
        self.items = {}
        self.table = MagicMock()
        self.table.get_item.side_effect = lambda Key, **kwargs: {"Item": dict(self.items[tuple(Key.values())])} if tuple(Key.values()) in self.items else {}
        def put_item(Item, **kwargs):
            key = (Item["pk"], Item["sk"])
            self.items[key] = dict(Item)
        self.table.put_item.side_effect = put_item
        self.resource = MagicMock()
        self.resource.Table.return_value = self.table
        self.env = patch.dict(os.environ, ENV)
        self.mock_resource = patch("boto3.resource", return_value=self.resource)
        self.env.start()
        self.mock_resource.start()
        subprocess.run([sys.executable, str(ROOT / "scripts" / "build_legal_manifest.py")], check=True)
        spec = importlib.util.spec_from_file_location(
            "studygrounds_legal_handler", ROOT / "backend" / "functions" / "legal" / "app.py"
        )
        self.handler = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.handler)

    def tearDown(self):
        self.mock_resource.stop()
        self.env.stop()

    def payload(self, **changes):
        result = {
            "termsVersion": "1.2", "privacyVersion": "1.2",
            "termsHash": self.handler.DOCUMENTS["terms"]["contentHash"],
            "privacyHash": self.handler.DOCUMENTS["privacy"]["contentHash"],
            "agreeToTerms": True, "acknowledgePrivacy": True,
            "age13OrOlder": True,
        }
        result.update(changes)
        return result

    def accept(self, **changes):
        return self.handler.lambda_handler(request(body=self.payload(**changes)), None)

    def status(self):
        return response_json(self.handler.lambda_handler(request("GET"), None))

    def seed_doc(self, name, version="1.2", age=False):
        self.items[("USER#user-123", "LEGAL#" + name + "#" + version)] = {
            "pk": "USER#user-123", "sk": "LEGAL#" + name + "#" + version,
            "acceptedAt": "2026-11-01T12:00:00Z",
            "contentHash": self.handler.DOCUMENTS[name]["contentHash"],
            **({"age13OrOlderConfirmed": True} if age else {}),
        }

    def test_first_acceptance_separately_records_age_once(self):
        self.assertTrue(self.status()["required"])
        self.assertFalse(self.status()["ageConfirmed"])
        result = self.accept()
        self.assertEqual(result["statusCode"], 200)
        self.assertEqual(self.table.put_item.call_count, 3)
        keys = [call.kwargs["Item"]["sk"] for call in self.table.put_item.call_args_list]
        self.assertEqual(keys, ["AGE#13_PLUS", "LEGAL#terms#1.2", "LEGAL#privacy#1.2"])
        self.assertTrue(self.items[("USER#user-123", "AGE#13_PLUS")]["age13OrOlderConfirmed"])
        self.assertNotIn("age13OrOlderConfirmed", self.items[("USER#user-123", "LEGAL#terms#1.2")])
        self.assertTrue(self.status()["ageConfirmed"])
        self.assertFalse(self.status()["required"])

    def test_existing_age_confirmation_does_not_repeat_on_later_policies(self):
        self.items[("USER#user-123", "AGE#13_PLUS")] = {
            "pk": "USER#user-123", "sk": "AGE#13_PLUS", "age13OrOlderConfirmed": True
        }
        self.seed_doc("terms")
        status = self.status()
        self.assertTrue(status["ageConfirmed"])
        self.assertTrue(status["documents"]["terms"]["accepted"])
        self.assertFalse(status["documents"]["privacy"]["accepted"])
        body = self.payload(acknowledgePrivacy=True)
        body.pop("age13OrOlder")
        result = self.handler.lambda_handler(request(body=body), None)
        self.assertEqual(result["statusCode"], 200)
        self.assertNotIn("age13OrOlderConfirmed", self.items[("USER#user-123", "LEGAL#privacy#1.2")])
        self.assertFalse(self.status()["required"])

    def test_legacy_age_migrates_from_previous_terms_versions(self):
        for version in ("1.1", "1.2"):
            with self.subTest(version=version):
                self.items.clear()
                self.seed_doc("terms", version=version, age=True)
                self.table.put_item.reset_mock()
                result = self.status()
                self.assertTrue(result["ageConfirmed"])
                saved = self.items[("USER#user-123", "AGE#13_PLUS")]
                self.assertEqual(saved["source"], "legacy-terms-" + version)
                self.table.put_item.assert_called_once()
                self.status()
                self.table.put_item.assert_called_once()

    def test_non_explicit_legacy_terms_does_not_skip_age(self):
        self.seed_doc("terms", version="1.1", age=False)
        self.assertFalse(self.status()["ageConfirmed"])
        payload = self.payload()
        payload.pop("age13OrOlder")
        result = self.handler.lambda_handler(request(body=payload), None)
        self.assertEqual(result["statusCode"], 403)
        self.table.put_item.assert_not_called()

    def test_mismatched_version_and_hash_rejected(self):
        result = self.accept(termsVersion="0.9")
        self.assertEqual(result["statusCode"], 409)
        result = self.accept(termsHash="wrong")
        self.assertEqual(result["statusCode"], 409)
        self.table.put_item.assert_not_called()

    def test_policy_agreement_is_required_for_outstanding_document(self):
        result = self.accept(acknowledgePrivacy=False)
        self.assertEqual(result["statusCode"], 400)
        result = self.accept(agreeToTerms=False)
        self.assertEqual(result["statusCode"], 400)
        self.table.put_item.assert_not_called()

    def test_under_13_and_unknown_fields_rejected(self):
        self.assertEqual(self.accept(age13OrOlder=False)["statusCode"], 403)
        self.assertEqual(self.accept(userId="another-user")["statusCode"], 400)
        self.table.put_item.assert_not_called()

    def test_get_acceptance_does_not_falsely_infer_age_from_version(self):
        self.seed_doc("terms")
        self.seed_doc("privacy")
        result = self.status()
        self.assertFalse(result["ageConfirmed"])
        self.assertTrue(result["required"])

if __name__ == "__main__":
    unittest.main()
