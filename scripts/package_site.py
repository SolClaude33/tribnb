from __future__ import annotations

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUTPUT = ROOT / "tribnb-site.zip"

files = sorted(path for path in DIST.rglob("*") if path.is_file())
if not files:
    raise SystemExit("dist is empty; run npm run build first")

with ZipFile(OUTPUT, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        archive.write(path, path.relative_to(DIST).as_posix())

with ZipFile(OUTPUT) as archive:
    names = archive.namelist()
    if len(names) != len(files) or "index.html" not in names:
        raise SystemExit("package verification failed")

print(f"Packaged {len(files)} files into {OUTPUT.name} ({OUTPUT.stat().st_size} bytes).")
