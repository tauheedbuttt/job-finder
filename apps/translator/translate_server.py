"""Local Finnish to English translation server for job-finder. Copied from kaanna, runs standalone.

Runs Helsinki-NLP Opus-MT (fi-en) through CTranslate2 on CPU.
Only prose is translated. URLs, code, :emoji: and unicode emoji
pass through untouched. @mentions stay inline so sentences stay whole.

Endpoints
  GET  /health                          -> {"ok": true, "model": ..., "modelPath": ...}
  POST /translate {"texts": [...]}      -> {"translations": [...]}
  POST /jev {"state": ..., "questions"} -> TypeSafe System One body, unchanged

Env (apps/translator/.env)
  TYPESAFE_API_KEY        Jev key, never leaves this server
  JOBFINDER_PORT          default 8790
  JOBFINDER_MODEL_CONFIG  folder list for model discovery (default models.json)
  JOBFINDER_FAKE=1        skip the model, echo "[en] ..." (UI testing)
  JOBFINDER_CACHE         sentence cache file (default cache.sqlite3)
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import sqlite3
import threading
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import List, Tuple

import httpx
import regex
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

import models

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.environ.get("JOBFINDER_DOTENV", os.path.join(HERE, ".env")))
log = logging.getLogger("jobfinder")
MODEL_HF = models.HF_MODEL
MODEL_CONFIG = os.path.join(HERE, os.environ.get("JOBFINDER_MODEL_CONFIG", "models.json"))
FAKE = os.environ.get("JOBFINDER_FAKE") == "1"
CACHE_DB = os.environ.get("JOBFINDER_CACHE", os.path.join(HERE, "cache.sqlite3"))
PORT = int(os.environ.get("JOBFINDER_PORT", "8790"))
JEV_URL = "https://api.typesafe.ai/v1/systemone"
JEV_MODEL = "jev-latest"
ORIGINS = r"^(chrome-extension://[a-p]{32}|moz-extension://[0-9a-f-]{36}|http://(localhost|127\.0\.0\.1)(:\d+)?)$"

# Pieces that must never reach the translator.
PROTECT = regex.compile(
    r"""
      (?:```.*?```)                                   # code block
    | (?:`[^`\n]+`)                                   # inline code
    | (?:https?://\S+)                                # url
    | (?::[a-z0-9_+\-']+:)                            # :shortcode:
    | (?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)
    """,
    regex.X | regex.S,
)

SENTENCE_SPLIT = regex.compile(r"(?<=[.!?…])\s+(?=[\p{Lu}0-9\"'(])")
HAS_LETTERS = regex.compile(r"\p{L}")
# List markers the model would drop: "• ", "- ", "1. ".
LIST_MARKER = regex.compile(r"^\s*(?:[•\-*>]|\d+[.)])\s+")
FINNISH_HINT = regex.compile(r"[äöÄÖåÅ]")


def segment(text: str) -> List[Tuple[bool, str]]:
    """Split into (is_prose, chunk). Protected chunks come back verbatim."""
    out: List[Tuple[bool, str]] = []
    pos = 0
    for m in PROTECT.finditer(text):
        if m.start() > pos:
            out.append((True, text[pos:m.start()]))
        out.append((False, m.group(0)))
        pos = m.end()
    if pos < len(text):
        out.append((True, text[pos:]))
    return out


def split_sentences(prose: str) -> List[Tuple[str, str, str]]:
    """Return (lead_ws, sentence, trail_ws) triples covering the prose exactly."""
    parts: List[Tuple[str, str, str]] = []
    for line_i, line in enumerate(prose.split("\n")):
        if line_i > 0:
            parts.append(("", "", "\n"))
        marker = LIST_MARKER.match(line)
        if marker:
            parts.append((marker.group(0), "", ""))
            line = line[marker.end():]
        pieces = SENTENCE_SPLIT.split(line)
        seps = SENTENCE_SPLIT.findall(line)
        for i, piece in enumerate(pieces):
            sep = seps[i] if i < len(seps) else ""
            core = piece.strip()
            if not core:
                parts.append((piece, "", sep))
                continue
            lead = piece[: len(piece) - len(piece.lstrip())]
            trail = piece[len(piece.rstrip()):]
            parts.append((lead, core, trail + sep))
    return parts


class Engine:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._translator = None
        self._tokenizer = None
        self._cache: "OrderedDict[str, str]" = OrderedDict()
        # Survives restarts, so a sentence is translated once ever. Keyed by model.
        self._model_key = "fake" if FAKE else MODEL_HF
        os.makedirs(os.path.dirname(CACHE_DB) or ".", exist_ok=True)
        self._db = sqlite3.connect(CACHE_DB, check_same_thread=False)
        self._db.execute("CREATE TABLE IF NOT EXISTS t (model TEXT, src TEXT, dst TEXT, PRIMARY KEY (model, src))")
        self._langid = None
        self.path = None

    def load(self) -> None:
        if FAKE or self._translator is not None:
            return
        import ctranslate2
        from transformers import AutoTokenizer

        self.path = models.resolve(MODEL_CONFIG)
        log.info("Model: %s", self.path)
        threads = max(1, (os.cpu_count() or 4) - 1)
        self._translator = ctranslate2.Translator(
            self.path, device="cpu", compute_type="int8", intra_threads=threads
        )
        # Local tokenizer files make the server work offline and when bundled.
        local = os.path.exists(os.path.join(self.path, "tokenizer_config.json"))
        self._tokenizer = AutoTokenizer.from_pretrained(self.path if local else MODEL_HF)

    def _lang(self):
        if self._langid is None:
            from lingua import Language, LanguageDetectorBuilder

            self._langid = LanguageDetectorBuilder.from_languages(
                Language.ENGLISH, Language.FINNISH, Language.SWEDISH, Language.ESTONIAN
            ).build()
        return self._langid

    def looks_english(self, text: str) -> bool:
        prose = " ".join(chunk for is_prose, chunk in segment(text) if is_prose).strip()
        if not HAS_LETTERS.search(prose):
            return True  # nothing to translate
        if FINNISH_HINT.search(prose):
            return False
        if len(prose.split()) < 3:
            return False  # too short to judge, let the model decide
        from lingua import Language

        conf = self._lang().compute_language_confidence(prose, Language.ENGLISH)
        return conf > 0.9

    def _run(self, sentences: List[str]) -> List[str]:
        if FAKE:
            return [f"[en] {s}" for s in sentences]
        tok = self._tokenizer
        batch = [tok.convert_ids_to_tokens(tok.encode(s)) for s in sentences]
        results = self._translator.translate_batch(
            batch, beam_size=2, max_batch_size=32, max_decoding_length=256
        )
        return [
            tok.decode(tok.convert_tokens_to_ids(r.hypotheses[0]), skip_special_tokens=True)
            for r in results
        ]

    def translate_sentences(self, sentences: List[str]) -> List[str]:
        with self._lock:
            missing = [s for s in dict.fromkeys(sentences) if s not in self._cache]
            for s in list(missing):
                row = self._db.execute("SELECT dst FROM t WHERE model=? AND src=?", (self._model_key, s)).fetchone()
                if row:
                    self._cache[s] = row[0]
                    missing.remove(s)
            if missing:
                for src, dst in zip(missing, self._run(missing)):
                    self._cache[src] = dst
                self._db.executemany(
                    "INSERT OR REPLACE INTO t VALUES (?, ?, ?)",
                    [(self._model_key, s, self._cache[s]) for s in missing],
                )
                self._db.commit()
                while len(self._cache) > 20000:
                    self._cache.popitem(last=False)
            return [self._cache[s] for s in sentences]

    def translate(self, texts: List[str]) -> List[str]:
        self.load()
        plans = []
        wanted: List[str] = []
        for text in texts:
            if self.looks_english(text):
                plans.append(None)
                continue
            plan = []
            for is_prose, chunk in segment(text):
                if not is_prose:
                    plan.append(("raw", chunk))
                    continue
                for lead, core, trail in split_sentences(chunk):
                    if core and HAS_LETTERS.search(core):
                        plan.append(("tr", lead, core, trail))
                        wanted.append(core)
                    else:
                        plan.append(("raw", lead + core + trail))
            plans.append(plan)

        done = dict(zip(wanted, self.translate_sentences(wanted))) if wanted else {}

        out: List[str] = []
        for text, plan in zip(texts, plans):
            if plan is None:
                out.append(text)
                continue
            buf = []
            for step in plan:
                if step[0] == "raw":
                    buf.append(step[1])
                else:
                    _, lead, core, trail = step
                    buf.append(lead + done[core] + trail)
            out.append("".join(buf))
        return out


engine = Engine()


@asynccontextmanager
async def lifespan(_: FastAPI):
    engine.load()
    yield


app = FastAPI(title="job-finder translator", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origin_regex=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["content-type"]
)
transport: "httpx.AsyncBaseTransport | None" = None
pause = asyncio.sleep


class TranslateRequest(BaseModel):
    texts: List[str]


class JevRequest(BaseModel):
    state: object
    questions: dict


@app.get("/health")
def health():
    return {"ok": True, "model": "fake" if FAKE else MODEL_HF, "modelPath": engine.path}


@app.post("/translate")
def translate(req: TranslateRequest):
    return {"translations": engine.translate(req.texts[:200])}


def backoff(attempt: int, res: httpx.Response) -> float:
    after = res.headers.get("retry-after", "")
    if after.replace(".", "", 1).isdigit():
        return min(float(after), 30.0)
    return 0.5 * 2**attempt + random.uniform(0, 0.25)


@app.post("/jev")
async def jev(req: JevRequest):
    key = os.environ.get("TYPESAFE_API_KEY")
    if not key:
        return JSONResponse({"detail": "TYPESAFE_API_KEY is not set in apps/translator/.env"}, status_code=503)
    body = {"state": req.state, "model": JEV_MODEL, "questions": req.questions}
    headers = {"authorization": f"Bearer {key}"}
    async with httpx.AsyncClient(transport=transport, timeout=60) as client:
        for attempt in range(4):
            try:
                res = await client.post(JEV_URL, json=body, headers=headers)
            except httpx.HTTPError as err:
                return JSONResponse({"detail": f"TypeSafe unreachable: {type(err).__name__}"}, status_code=502)
            if res.status_code not in (429, 529) or attempt == 3:
                break
            await pause(backoff(attempt, res))
    kind = res.headers.get("content-type", "application/json")
    return Response(res.content, status_code=res.status_code, media_type=kind)


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(message)s")
    uvicorn.run(app, host="127.0.0.1", port=PORT)
