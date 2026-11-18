"""DEV-only metadata/robots protection for copied static frontend assets."""
from pathlib import Path
import sys

INDEX = '<meta name="robots" content="index,follow">'
NOINDEX = '<meta name="robots" content="noindex,nofollow,noarchive">'


def prepare(directory):
    root = Path(directory)
    for filename in ("index.html", "study-notes.html"):
        file = root / filename
        text = file.read_text(encoding="utf-8")
        if text.count(INDEX) != 1:
            raise ValueError(f"Expected exactly one robots index tag in {filename}")
        file.write_text(text.replace(INDEX, NOINDEX), encoding="utf-8")
    (root / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    # S3 fallback should not advertise the production sitemap in DEV.
    (root / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n',
        encoding="utf-8",
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: prepare_dev_seo.py <dist-directory>")
    prepare(sys.argv[1])
