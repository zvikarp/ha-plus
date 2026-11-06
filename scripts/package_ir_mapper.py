"""Build a HACS/manual-install archive with integration files at its root."""

import json
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "custom_components" / "broadlink_ir_mapper"


def package() -> Path:
    version = json.loads((SOURCE / "manifest.json").read_text())["version"]
    tag = os.environ.get("IR_RELEASE_TAG")
    if tag is not None and tag != f"v{version}":
        raise ValueError(f"Tag must be v{version}")
    output = ROOT / "broadlink_ir_mapper.zip"
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.write(ROOT / "LICENSE", "LICENSE")
        for path in sorted(SOURCE.rglob("*")):
            if path.is_file() and path.suffix in {
                ".py",
                ".json",
                ".png",
                ".svg",
                ".js",
                ".yaml",
            }:
                if "__pycache__" not in path.parts:
                    archive.write(path, path.relative_to(SOURCE))
    return output


if __name__ == "__main__":
    print(package())
