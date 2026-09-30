"""Model discovery: scan models.json folders in order for model.bin, else download once into TARGET."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
from typing import Callable, List, Optional

log = logging.getLogger("jobfinder.models")

HF_MODEL = "Helsinki-NLP/opus-mt-tc-big-fi-en"
TARGET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "opus-fi-en-ct2")


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


def resolve(config: str, download: Callable[[str], None] = fetch, target: str = TARGET) -> str:
    # Listed folders are read only, downloads only ever land in target.
    paths = folders(config)
    hit = find(paths + [target])
    if hit:
        return hit
    log.warning("No model found in %s. Downloading %s to %s", paths, HF_MODEL, target)
    os.makedirs(target, exist_ok=True)
    download(target)
    if not os.path.isfile(os.path.join(target, "model.bin")):
        raise RuntimeError(f"Download to {target} did not produce model.bin")
    return target
