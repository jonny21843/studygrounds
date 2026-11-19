"""Public SEO endpoint isolation, sitemap and static DEV indexing safeguards."""
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SEO = ROOT / "backend/functions/public/seo/app.py"
PREP = ROOT / "scripts/prepare_dev_seo.py"
NOTE_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"


def load(path, name, env=None):
    with patch.dict(os.environ, env or {}), patch("boto3.resource", return_value=MagicMock()):
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module


def note(id=NOTE_ID, title="Biology", visibility="public", hold=False, malware="NO_THREATS_FOUND"):
    return {
        "userId": "owner", "noteId": id, "title": title, "visibility": visibility,
        "moderationHold": hold,
        "files": [{"filename": "notes.pdf", "malwareScanStatus": malware}],
        "publishedAt": "2026-11-01T12:00:00Z", "description": "Study materials",
    }


class PublicSeoTests(unittest.TestCase):
    def setUp(self):
        self.mod = load(SEO, "seo_prod_test", {
            "NOTES_TABLE": "test", "ENVIRONMENT_NAME": "prod",
            "SITE_URL": "https://joinstudygrounds.com",
        })
        self.mod.table.reset_mock()

    def route(self, slug="biology"):
        return {
            "rawPath": f"/notes/{NOTE_ID}/{slug}",
            "pathParameters": {"noteId": NOTE_ID, "slug": slug},
        }

    def test_published_note_is_indexable_with_canonical(self):
        self.mod.table.query.return_value = {"Items": [{"userId": "owner"}]}
        self.mod.table.get_item.return_value = {"Item": note()}
        response = self.mod.lambda_handler(self.route(), None)
        self.assertEqual(response["statusCode"], 200)
        self.assertIn("https://joinstudygrounds.com/notes/", response["body"])
        self.assertIn("LearningResource", response["body"])
        self.assertNotIn("X-Robots-Tag", response["headers"])
        self.assertTrue(self.mod.table.get_item.call_args.kwargs["ConsistentRead"])

    def test_selected_language_in_public_note_seo(self):
        self.mod.table.query.return_value = {"Items": [{"userId": "owner"}]}
        self.mod.table.get_item.return_value = {"Item": {**note(), "language": "es"}}
        response = self.mod.lambda_handler(self.route(), None)
        self.assertEqual(response["statusCode"], 200)
        self.assertIn('<html lang="es">', response["body"])
        self.assertIn('"inLanguage": "es"', response["body"])

    def test_no_private_moderated_or_unsafe_pages(self):
        self.mod.table.query.return_value = {"Items": [{"userId": "owner"}]}
        for record in (
            note(visibility="private"),
            note(hold=True),
            note(malware="THREATS_FOUND"),
        ):
            self.mod.table.get_item.return_value = {"Item": record}
            response = self.mod.lambda_handler(self.route(), None)
            self.assertEqual(response["statusCode"], 404)
            self.assertEqual(response["headers"]["X-Robots-Tag"], "noindex")

    def test_dynamic_sitemap_only_contains_safe_public_records(self):
        self.mod.table.scan.return_value = {"Items": [
            note("1", "Visible"), note("2", "Removed", hold=True),
            note("3", "Private", visibility="private"),
            note("4", "Unsafe", malware="THREATS_FOUND"),
        ]}
        response = self.mod.lambda_handler({"rawPath": "/sitemap.xml"}, None)
        self.assertEqual(response["statusCode"], 200)
        root = ET.fromstring(response["body"])
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        links = [x.text for x in root.findall(".//s:loc", ns)]
        self.assertEqual(len(links), 3)
        self.assertTrue(any("/notes/1/visible" in link for link in links))
        self.assertFalse(any("/notes/2/" in link or "/notes/3/" in link or "/notes/4/" in link for link in links))
        self.assertTrue(self.mod.table.scan.call_args.kwargs["ConsistentRead"])

    def test_development_seo_is_noindex(self):
        dev = load(SEO, "seo_dev_test", {
            "NOTES_TABLE": "test", "ENVIRONMENT_NAME": "dev",
            "SITE_URL": "https://dev.joinstudygrounds.com",
        })
        dev.table.scan.return_value = {"Items": []}
        sitemap = dev.lambda_handler({"rawPath": "/sitemap.xml"}, None)
        self.assertIn("noindex", sitemap["headers"]["X-Robots-Tag"])
        self.assertIn("dev.joinstudygrounds.com", sitemap["body"])
        self.assertNotIn("<loc>https://joinstudygrounds.com", sitemap["body"])

    def test_dev_assets_do_not_change_source_or_advertise_prod(self):
        prep = load(PREP, "prepare_dev_test")
        with tempfile.TemporaryDirectory() as folder:
            temp = Path(folder)
            for name in ("index.html", "study-notes.html"):
                source = (ROOT / name).read_text(encoding="utf-8")
                (temp / name).write_text(source, encoding="utf-8")
            prep.prepare(temp)
            for name in ("index.html", "study-notes.html"):
                self.assertIn("noindex,nofollow,noarchive", (temp / name).read_text(encoding="utf-8"))
                self.assertIn('content="index,follow"', (ROOT / name).read_text(encoding="utf-8"))
            self.assertIn("Disallow: /", (temp / "robots.txt").read_text(encoding="utf-8"))
            self.assertNotIn("joinstudygrounds.com", (temp / "sitemap.xml").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
