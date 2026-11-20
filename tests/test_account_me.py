"""Confirm authenticated /api/me does not grant access to deleting accounts."""
import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("studygrounds_me", ROOT / "backend" / "functions" / "me" / "app.py")
me = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(me)

def event(sub="user-123"):
    return {"requestContext": {"authorizer": {"jwt": {"claims": {"sub": sub, "token_use": "access"}}}}}

class MeAccountDeletionTests(unittest.TestCase):
    def test_active_account_allowed(self):
        table = MagicMock()
        table.get_item.return_value = {}
        with patch.dict(os.environ, {"LEGAL_PREFERENCES_TABLE": "prefs"}), patch("boto3.resource") as resource:
            resource.return_value.Table.return_value = table
            result = me.lambda_handler(event(), None)
        self.assertEqual(result["statusCode"], 200)

    def test_pending_deletion_blocks_access(self):
        table = MagicMock()
        table.get_item.return_value = {"Item": {"status": "PENDING"}}
        with patch.dict(os.environ, {"LEGAL_PREFERENCES_TABLE": "prefs"}), patch("boto3.resource") as resource:
            resource.return_value.Table.return_value = table
            result = me.lambda_handler(event(), None)
        self.assertEqual(result["statusCode"], 423)
        table.get_item.assert_called_once_with(
            Key={"pk": "USER#user-123", "sk": "ACCOUNT#DELETION"}, ConsistentRead=True
        )

    def test_non_access_jwt_rejected_before_database_lookup(self):
        e = event()
        e["requestContext"]["authorizer"]["jwt"]["claims"]["token_use"] = "id"
        with patch("boto3.resource") as resource:
            result = me.lambda_handler(e, None)
        self.assertEqual(result["statusCode"], 403)
        resource.assert_not_called()

if __name__ == "__main__":
    unittest.main()
