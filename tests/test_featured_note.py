import importlib.util,json,os,sys,types,unittest
from unittest.mock import MagicMock,patch
os.environ.update({"NOTES_TABLE":"notes","PREFERENCES_TABLE":"prefs","ADMIN_EMAILS":"admin@example.com"})
mock_boto=types.SimpleNamespace(resource=lambda _:types.SimpleNamespace(Table=lambda _:MagicMock()))
with patch.dict(sys.modules,{"boto3":mock_boto}):
    spec=importlib.util.spec_from_file_location("featured","backend/functions/featured/app.py")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
ID="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
def ev(path,method,sub=None,email=None,body=None):
    return {"rawPath":path,"requestContext":{"http":{"method":method},"authorizer":{"jwt":{"claims":{"sub":sub,"email":email}}}},"body":json.dumps(body) if body else None}
class FeaturedTest(unittest.TestCase):
    def setUp(self):mod.prefs.reset_mock();mod.notes.reset_mock()
    def test_admin_only(self):
        self.assertEqual(mod.lambda_handler(ev("/api/admin/featured-note","DELETE",sub="ordinary"),None)["statusCode"],403)
        mod.prefs.delete_item.assert_not_called()
    def test_only_public_can_feature(self):
        with patch.object(mod,"available",return_value=None):
            self.assertEqual(mod.lambda_handler(ev("/api/admin/featured-note","PUT",email="admin@example.com",body={"noteId":ID}),None)["statusCode"],400)
    def test_no_moderated_feature(self):
        with patch.object(mod,"featured",return_value={"noteId":ID}),patch.object(mod,"available",return_value=None):
            self.assertEqual(json.loads(mod.lambda_handler(ev("/api/featured-note","GET"),None)["body"]),{"note":None})
    def test_dismissal_is_user_scoped(self):
        with patch.object(mod,"featured",return_value={"noteId":ID}),patch.object(mod,"available",return_value={"noteId":ID}):
            mod.lambda_handler(ev("/api/featured-note/dismissal","PUT",sub="abc"),None)
            self.assertEqual(mod.prefs.put_item.call_args.kwargs["Item"]["pk"],"USER#abc")
            self.assertEqual(mod.prefs.put_item.call_args.kwargs["Item"]["sk"],"FEATURED_NOTE#"+ID)
            mod.lambda_handler(ev("/api/featured-note/dismissal","DELETE",sub="xyz"),None)
            self.assertEqual(mod.prefs.delete_item.call_args.kwargs["Key"]["pk"],"USER#xyz")
    def test_anonymous_cannot_dismiss(self):
        self.assertEqual(mod.lambda_handler(ev("/api/featured-note/dismissal","PUT"),None)["statusCode"],401)
    def test_record_check_is_consistent(self):
        mod.notes.query.return_value={"Items":[{"userId":"owner"}]}
        for visibility,hold,ok in [("public",True,False),("private",False,False),("public",False,True)]:
            mod.notes.get_item.return_value={"Item":{"visibility":visibility,"moderationHold":hold,"files":[{"malwareScanStatus":"NO_THREATS_FOUND"}]}}
            self.assertEqual(bool(mod.available(ID)),ok)
        self.assertTrue(mod.notes.get_item.call_args.kwargs["ConsistentRead"])
if __name__=="__main__":unittest.main()
