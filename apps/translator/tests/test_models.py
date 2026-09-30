import json
import os

import pytest

import models


def folder(root, name, bin=False):
    path = root / name
    path.mkdir()
    if bin:
        (path / "model.bin").write_bytes(b"x")
    return str(path)


def config(root, folders):
    path = root / "models.json"
    path.write_text(json.dumps(folders))
    return str(path)


def test_first_hit_wins(tmp_path):
    a = folder(tmp_path, "a")
    b = folder(tmp_path, "b", bin=True)
    c = folder(tmp_path, "c", bin=True)
    assert models.resolve(config(tmp_path, [a, b, c]), download=pytest.fail) == b


def test_relative_paths_use_config_dir(tmp_path):
    folder(tmp_path, "rel", bin=True)
    assert models.resolve(config(tmp_path, ["rel"]), download=pytest.fail) == str(tmp_path / "rel")


def test_none_found_downloads_once_to_first_writable(tmp_path):
    locked = folder(tmp_path, "locked")
    os.chmod(locked, 0o500)
    target = str(tmp_path / "fresh" / "model")
    calls = []

    def download(path):
        calls.append(path)
        os.makedirs(path, exist_ok=True)
        open(os.path.join(path, "model.bin"), "wb").close()

    cfg = config(tmp_path, [locked, target])
    try:
        assert models.resolve(cfg, download=download) == target
        assert models.resolve(cfg, download=download) == target
    finally:
        os.chmod(locked, 0o700)
    assert calls == [target]


def test_no_writable_folder_raises(tmp_path):
    locked = folder(tmp_path, "locked")
    os.chmod(locked, 0o500)
    try:
        with pytest.raises(RuntimeError):
            models.resolve(config(tmp_path, [locked + "/deep"]), download=pytest.fail)
    finally:
        os.chmod(locked, 0o700)


def test_failed_download_raises(tmp_path):
    target = str(tmp_path / "t")
    with pytest.raises(RuntimeError):
        models.resolve(config(tmp_path, [target]), download=lambda path: None)
