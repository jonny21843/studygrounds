"""Build immutable source fingerprints used by the legal acceptance API.

Run before tests and SAM packaging. Exact hashes correspond to the public HTML
that is shipped in the same frontend release, not user-provided hash values.
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAM = (ROOT / "infrastructure" / "template.yaml").read_text(encoding="utf-8")
FILES = {
    "terms": ("terms.html", "LEGAL_TERMS_VERSION", True),
    "privacy": ("privacy.html", "LEGAL_PRIVACY_VERSION", True),
    "guidelines": ("community-guidelines.html", None, False),
    "copyright": ("copyright.html", None, False),
}

def build():
    documents = {}
    for key, (filename, setting, required) in FILES.items():
        content = (ROOT / filename).read_bytes()
        html = content.decode("utf-8")
        if setting:
            matches = re.findall(r"^\s*" + setting + r':\s*"([^"]+)"\s*$', SAM, flags=re.M)
            if len(matches) != 1:
                raise ValueError("Expected one " + setting + " in infrastructure/template.yaml")
            version = matches[0]
        else:
            version = "1.0"
        if "Version " + version not in html and "Version " + version.replace(".", "&#46;") not in html:
            raise ValueError(filename + " visible version does not match " + version)
        documents[key] = {
            "version": version,
            "effectiveDate": "2026-11-19",
            "url": "/" + filename,
            "required": required,
            "contentHash": hashlib.sha256(content).hexdigest(),
        }
    target = ROOT / "backend" / "functions" / "legal" / "manifest.json"
    target.write_text(json.dumps(documents, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("Built legal document manifest with versioned SHA-256 fingerprints.")

if __name__ == "__main__":
    build()
