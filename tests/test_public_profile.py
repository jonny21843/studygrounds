"""Public profile validation and identity isolation regression tests."""
import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

APP = Path(__file__).resolve().parents[1] / "backend/functions/profile/app.py"


class PublicProfileTests(unittest.TestCase):
    def setUp(self):
        self.aws = MagicMock()
        self.cognito = self.aws.client.return_value
        self.profiles = self.aws.resource.return_value.Table.return_value
        self.cognito.admin_get_user.return_value = {"UserAttributes": [
            {"Name": "given_name", "Value": "Taylor"},
            {"Name": "family_name", "Value": "Example"},
        ]}
        self.profiles.get_item.return_value = {}
        with patch.dict(os.environ, {"COGNITO_USER_POOL_ID":"test-pool", "PREFERENCES_TABLE":"test-prefs"}):
            with patch("boto3.client", self.aws.client), patch("boto3.resource", self.aws.resource):
                spec = importlib.util.spec_from_file_location("public_profile_test", APP)
                self.mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(self.mod)

    def event(self, method="GET", body=None, sub="private-user-id"):
        return {"requestContext": {"authorizer": {"jwt": {"claims": {
            "username": "cognito-user", "sub": sub,
        }}}, "http": {"method": method}}, "body": json.dumps(body) if body is not None else ""}

    def test_missing_profile_is_backwards_compatible(self):
        response = self.mod.lambda_handler(self.event(), None)
        self.assertEqual(response["statusCode"], 200)
        profile = json.loads(response["body"])["profile"]
        self.assertEqual(profile["publicAuthor"], "Taylor E.")
        self.assertEqual(profile["avatarStyle"], "indigo")
        self.assertEqual(profile["bio"], "")
        self.profiles.get_item.assert_called_with(
            Key={"pk":"USER#private-user-id","sk":"PUBLIC_PROFILE"},ConsistentRead=True)

    def test_edit_bio_and_avatar(self):
        response = self.mod.lambda_handler(self.event("PATCH", {
            "firstName":"Taylor", "lastName":"Example",
            "bio":"Love biology and science!", "avatarStyle":"rose",
        }), None)
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(json.loads(response["body"])["profile"]["bio"], "Love biology and science!")
        self.profiles.put_item.assert_called_once()
        self.assertEqual(self.profiles.put_item.call_args.kwargs["Item"]["pk"], "USER#private-user-id")
        self.assertNotIn("private-user-id", response["body"])

    def test_rejects_invalid_and_oversized_fields(self):
        for payload in (
            {"firstName":"A","lastName":"B","bio":"x"*281},
            {"firstName":"A","lastName":"B","avatarStyle":"<script>"},
            {"firstName":"A","lastName":"B","bio":["not a string"]},
        ):
            response = self.mod.lambda_handler(self.event("PATCH", payload), None)
            self.assertEqual(response["statusCode"], 400)
        self.cognito.admin_update_user_attributes.assert_not_called()
        self.profiles.put_item.assert_not_called()

    def test_account_identity_required(self):
        response = self.mod.lambda_handler(self.event(sub=""), None)
        self.assertEqual(response["statusCode"], 401)


if __name__ == "__main__":
    unittest.main()
