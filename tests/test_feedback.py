import importlib.util
import json
import os
import unittest
from unittest.mock import MagicMock, patch
from botocore.exceptions import ClientError

os.environ.update({"FEEDBACK_TABLE":"test-feedback","ADMIN_EMAILS":"admin@example.com"})
with patch("boto3.resource", return_value=MagicMock()):
    spec=importlib.util.spec_from_file_location("feedback","backend/functions/feedback/app.py")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

def event(path,method,sub=None,email=None,body=None,feedback_id=None):
    return {"rawPath":path,"requestContext":{"http":{"method":method},"authorizer":{"jwt":{"claims":{"sub":sub,"email":email}}}},"body":json.dumps(body) if body is not None else None,"pathParameters":{"feedbackId":feedback_id} if feedback_id else {}}
VALID={"category":"bug","subject":"Broken button","details":"When I click save, nothing happens."}
class FeedbackTests(unittest.TestCase):
    def setUp(self):
        mod.table.reset_mock()
        mod.table.update_item.side_effect = None
    def test_auth_required(self):
        self.assertEqual(mod.lambda_handler(event("/api/feedback","POST",body=VALID),None)["statusCode"],401)
        self.assertEqual(mod.lambda_handler(event("/api/admin/feedback","GET",sub="member"),None)["statusCode"],403)
        mod.table.put_item.assert_not_called()
    def test_invalid_input_rejected_before_rate_limit(self):
        for body in ({"category":"invalid","subject":"test","details":"Long enough details."}, {**VALID,"details":"short"}, {**VALID,"context":"X"*251}):
            self.assertEqual(mod.lambda_handler(event("/api/feedback","POST",sub="member",body=body),None)["statusCode"],400)
        mod.table.update_item.assert_not_called()
    def test_submission_and_identity(self):
        result=mod.lambda_handler(event("/api/feedback","POST",sub="member",email="member@example.com",body=VALID),None)
        self.assertEqual(result["statusCode"],201)
        item=mod.table.put_item.call_args.kwargs["Item"]
        self.assertEqual(item["userId"],"member")
        self.assertEqual(item["status"],"NEW")
        self.assertEqual(mod.table.update_item.call_args.kwargs["Key"],{"feedbackId":"LIMIT#member"})
    def test_cooldown(self):
        mod.table.update_item.side_effect=ClientError({"Error":{"Code":"ConditionalCheckFailedException","Message":"blocked"}},"UpdateItem")
        result=mod.lambda_handler(event("/api/feedback","POST",sub="member",body=VALID),None)
        self.assertEqual(result["statusCode"],429)
        mod.table.put_item.assert_not_called()
    def test_admin_status_and_no_implicit_creation(self):
        target="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
        ok=mod.lambda_handler(event("/api/admin/feedback/"+target,"PATCH",email="admin@example.com",body={"status":"IN_REVIEW"},feedback_id=target),None)
        self.assertEqual(ok["statusCode"],200)
        self.assertEqual(mod.table.update_item.call_args.kwargs["ConditionExpression"],"attribute_exists(feedbackId)")
        self.assertEqual(mod.lambda_handler(event("/api/admin/feedback/"+target,"PATCH",email="admin@example.com",body={"status":"HACKED"},feedback_id=target),None)["statusCode"],400)
    def test_admin_listing_excludes_rate_records(self):
        mod.table.scan.return_value={"Items":[{"feedbackId":"LIMIT#member"},{"feedbackId":"item","createdAt":"2026-01-01","status":"NEW"}]}
        result=mod.lambda_handler(event("/api/admin/feedback","GET",email="admin@example.com"),None)
        self.assertEqual(len(json.loads(result["body"])["feedback"]),1)
if __name__=="__main__":
    unittest.main()
