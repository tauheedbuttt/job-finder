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


def fake_download(calls):
    def download(path):
        calls.append(path)
        os.makedirs(path, exist_ok=True)
        open(os.path.join(path, "model.bin"), "wb").close()

    return download


def test_none_found_downloads_once_to_own_folder(tmp_path):
    kaanna = folder(tmp_path, "kaanna")
    target = str(tmp_path / "own" / "model")
    calls = []
    cfg = config(tmp_path, [kaanna])
    assert models.resolve(cfg, download=fake_download(calls), target=target) == target
    assert models.resolve(cfg, download=fake_download(calls), target=target) == target
    assert calls == [target]


def test_never_writes_into_listed_folders(tmp_path):
    kaanna = folder(tmp_path, "kaanna")
    missing = str(tmp_path / "missing")
    target = str(tmp_path / "own")
    calls = []
    models.resolve(config(tmp_path, [kaanna, missing]), download=fake_download(calls), target=target)
    assert calls == [target]
    assert os.listdir(kaanna) == []
    assert not os.path.exists(missing)


def test_listed_folder_beats_own_folder(tmp_path):
    kaanna = folder(tmp_path, "kaanna", bin=True)
    own = folder(tmp_path, "own", bin=True)
    assert models.resolve(config(tmp_path, [kaanna]), download=pytest.fail, target=own) == kaanna


def test_default_target_is_translator_models(tmp_path):
    assert models.TARGET == os.path.join(os.path.dirname(os.path.abspath(models.__file__)), "models", "opus-fi-en-ct2")


def test_failed_download_raises(tmp_path):
    with pytest.raises(RuntimeError):
        models.resolve(config(tmp_path, []), download=lambda path: None, target=str(tmp_path / "t"))
