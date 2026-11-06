"""Release archive and upgrade identity checks."""

import importlib.util
import json
from pathlib import Path
from zipfile import ZipFile

import pytest

ROOT = Path(__file__).resolve().parents[2]


def test_release_archive_and_tag_guard(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location(
        "ir_package", ROOT / "scripts/package_ir_mapper.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    (tmp_path / "LICENSE").write_text((ROOT / "LICENSE").read_text())
    monkeypatch.setattr(module, "ROOT", tmp_path)
    manifest = json.loads((module.SOURCE / "manifest.json").read_text())
    monkeypatch.setenv("IR_RELEASE_TAG", f"v{manifest['version']}")
    with ZipFile(module.package()) as archive:
        names = archive.namelist()
        assert {"manifest.json", "__init__.py", "light.py", "brand/icon.png"} <= set(
            names
        )
        assert all(
            "__pycache__" not in name and not name.endswith(".pyc") for name in names
        )
        assert (
            json.loads(archive.read("manifest.json"))["domain"] == "broadlink_ir_mapper"
        )
        assert archive.testzip() is None
    monkeypatch.setenv("IR_RELEASE_TAG", "v999.0.0")
    with pytest.raises(ValueError, match="Tag must be"):
        module.package()
