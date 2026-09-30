"""Model discovery: scan models.json folders in order for model.bin, download once if none."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from typing import Callable, List, Optional

log = logging.getLogger("jobfinder.models")

HF_MODEL = "Helsinki-NLP/opus-mt-tc-big-fi-en"


def folders(config: str) -> List[str]:
    base = os.path.dirname(os.path.abspath(config))
    with open(config) as f:
        items = json.load(f)
    return [os.path.normpath(os.path.join(base, os.path.expanduser(p))) for p in items]


def find(paths: List[str]) -> Optional[str]:
    for path in paths:
        if os.path.isfile(os.path.join(path, "model.bin")):
            return path
    return None


def writable(path: str) -> bool:
    probe = path
    while not os.path.exists(probe):
        parent = os.path.dirname(probe)
        if parent == probe:
            return False
        probe = parent
    return os.path.isdir(probe) and os.access(probe, os.W_OK | os.X_OK)


def fetch(path: str) -> None:
    # Converter needs torch; it is installed on demand, like kaanna setup.
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "torch"], check=True)
    converter = os.path.join(os.path.dirname(sys.executable), "ct2-transformers-converter")
    subprocess.run(
        [converter, "--model", HF_MODEL, "--output_dir", path, "--quantization", "int8", "--force"],
        check=True,
    )
    from transformers import AutoTokenizer

    AutoTokenizer.from_pretrained(HF_MODEL).save_pretrained(path)


def resolve(config: str, download: Callable[[str], None] = fetch) -> str:
    paths = folders(config)
    hit = find(paths)
    if hit:
        return hit
    target = next((p for p in paths if writable(p)), None)
    if target is None:
        raise RuntimeError(f"No model.bin in {paths} and no writable folder to download into")
    log.warning("No model found in %s. Downloading %s to %s", paths, HF_MODEL, target)
    download(target)
    if not os.path.isfile(os.path.join(target, "model.bin")):
        raise RuntimeError(f"Download to {target} did not produce model.bin")
    return target
