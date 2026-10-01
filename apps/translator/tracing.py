"""Langfuse tracing for /jev. Off unless both LANGFUSE keys are set.

Headers from the extension group calls:
  x-jf-session  one feature run, e.g. one list page load or one panel analyze
  x-jf-flow     trace name and tag: list-card, panel-analyze
  x-jf-url      job page url; one trace per session and url
"""

from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Callable, Iterator, Mapping

NAMES = {
    "requires_finnish": "finnish-fast",
    "description": "pick-description",
    "apply": "pick-apply",
    "confirm": "confirm-apply",
}

Done = Callable[[int, bytes], None]


def enabled() -> bool:
    return bool(os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY"))


def name(questions: Mapping[str, object]) -> str:
    keys = [k for k in questions if k != "requires_experience"]
    if len(keys) > 1 and "requires_finnish" in keys:
        return "finnish-sentences"
    if len(keys) == 1:
        return NAMES.get(keys[0], keys[0])
    return "+".join(keys[:3]) or "jev"


def usage(body: object) -> dict:
    raw = body.get("usage") if isinstance(body, dict) else None
    if not isinstance(raw, dict):
        return {}
    out = {"input": raw.get("input_tokens"), "output": raw.get("output_tokens")}
    return {k: int(v) for k, v in out.items() if isinstance(v, (int, float))}


def client():
    from langfuse import get_client

    return get_client()


def shutdown() -> None:
    if enabled():
        client().shutdown()


@contextmanager
def generation(headers: Mapping[str, str], state: object, questions: dict, model: str) -> Iterator[Done]:
    if not enabled():
        yield lambda status, content: None
        return
    from langfuse import propagate_attributes

    lf = client()
    session = headers.get("x-jf-session") or None
    flow = headers.get("x-jf-flow") or "jev"
    url = headers.get("x-jf-url") or ""
    context = {"trace_id": lf.create_trace_id(seed=f"{session}|{url}")} if session else None
    with propagate_attributes(session_id=session, trace_name=flow, tags=[flow], metadata={"url": url[:200]}):
        with lf.start_as_current_observation(
            trace_context=context,
            as_type="generation",
            name=name(questions),
            model=model,
            input={"state": state, "questions": questions},
            metadata={"url": url, "questions": len(questions)},
        ) as gen:

            def done(status: int, content: bytes) -> None:
                try:
                    body = json.loads(content)
                except ValueError:
                    body = content.decode("utf-8", "replace")
                if status >= 400:
                    gen.update(level="ERROR", status_message=f"Jev {status}", output=body)
                    return
                gen.update(model=body.get("model", model), output=body.get("answers"), usage_details=usage(body))

            yield done
