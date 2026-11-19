"""Stage the shared legal guard into only the Lambda packages that use it.

AWS SAM builds each CodeUri independently. Copying from one maintained source
avoids a new Lambda Layer, additional PublishLayerVersion IAM requirements,
and modifying unrelated public/read-only Lambda configurations.
"""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "backend" / "layers" / "legal" / "python" / "legal_guard.py"
HANDLERS = (
    "feedback", "featured", "profile", "admin/security",
    "notes/create", "notes/update", "notes/upload", "notes/files",
    "notes/delete_file", "notes/delete", "notes/publish",
    "public/report", "admin/moderation", "notifications",
    "helpful", "study", "saved",
)

def stage():
    for name in HANDLERS:
        directory = ROOT / "backend" / "functions" / name
        handler = directory / "app.py"
        if not handler.is_file() or "from legal_guard import require_legal_acceptance" not in handler.read_text(encoding="utf-8"):
            raise RuntimeError(f"Guard import missing from {handler}")
        shutil.copyfile(SOURCE, directory / "legal_guard.py")
    print(f"Staged shared legal guard into {len(HANDLERS)} Lambda build folders.")

if __name__ == "__main__":
    stage()
