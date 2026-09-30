import json

import httpx
import pytest
from fastapi.testclient import TestClient

import translate_server as server

BODY = {"state": {"text": "Suomen kielen taito on eduksi."}, "questions": {"q": {"type": "noul", "instructions": "?"}}}
ANSWER = {"model": "jev-1.13.0", "answers": {"q": {"type": "noul", "noul": 0.9}}, "usage": {"input_tokens": 1, "output_tokens": 1}}


@pytest.fixture
def client():
    return TestClient(server.app)


@pytest.fixture
def upstream(monkeypatch):
    seen = []
    replies = []
    waits = []

    def handler(request):
        seen.append(request)
        status, body = replies.pop(0) if replies else (200, ANSWER)
        return httpx.Response(status, json=body)

    async def pause(seconds):
        waits.append(seconds)

    monkeypatch.setenv("TYPESAFE_API_KEY", "test-key")
    monkeypatch.setattr(server, "transport", httpx.MockTransport(handler))
    monkeypatch.setattr(server, "pause", pause)
    return seen, replies, waits


def test_health(client):
    body = client.get("/health").json()
    assert body["ok"] is True
    assert set(body) >= {"ok", "model", "modelPath"}


def test_translate_fake(client):
    res = client.post("/translate", json={"texts": ["Hyvää päivää. Katso https://duunitori.fi nyt."]})
    assert res.json() == {"translations": ["[en] Hyvää päivää. [en] Katso https://duunitori.fi [en] nyt."]}


def test_jev_forwards_with_key_and_model(client, upstream):
    seen, _, _ = upstream
    res = client.post("/jev", json=BODY)
    assert res.status_code == 200
    assert res.json() == ANSWER
    sent = seen[0]
    assert sent.url == "https://api.typesafe.ai/v1/systemone"
    assert sent.headers["authorization"] == "Bearer test-key"
    assert json.loads(sent.content) == {**BODY, "model": "jev-latest"}


def test_jev_retries_429_and_529(client, upstream):
    seen, replies, waits = upstream
    replies += [(429, {"detail": "slow"}), (529, {"detail": "busy"})]
    res = client.post("/jev", json=BODY)
    assert res.status_code == 200
    assert len(seen) == 3
    assert waits[0] < waits[1]


def test_jev_gives_up_after_three_retries(client, upstream):
    seen, replies, _ = upstream
    replies += [(429, {"detail": "slow"})] * 5
    res = client.post("/jev", json=BODY)
    assert res.status_code == 429
    assert len(seen) == 4


def test_jev_passes_errors_through(client, upstream):
    seen, replies, _ = upstream
    replies.append((422, {"detail": "bad question"}))
    res = client.post("/jev", json=BODY)
    assert res.status_code == 422
    assert res.json() == {"detail": "bad question"}
    assert len(seen) == 1


def test_jev_without_key_is_503(client, upstream, monkeypatch):
    seen, _, _ = upstream
    monkeypatch.delenv("TYPESAFE_API_KEY")
    res = client.post("/jev", json=BODY)
    assert res.status_code == 503
    assert "TYPESAFE_API_KEY" in res.json()["detail"]
    assert seen == []


def test_jev_upstream_down_is_502(client, monkeypatch):
    def handler(request):
        raise httpx.ConnectError("down")

    monkeypatch.setenv("TYPESAFE_API_KEY", "k")
    monkeypatch.setattr(server, "transport", httpx.MockTransport(handler))
    assert client.post("/jev", json=BODY).status_code == 502


def test_cors_allows_extension_and_localhost_only(client):
    def allowed(origin):
        res = client.options("/translate", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
        return res.headers.get("access-control-allow-origin") == origin

    assert allowed("chrome-extension://abcdefghijklmnopabcdefghijklmnop")
    assert allowed("http://localhost:3000")
    assert allowed("http://127.0.0.1:8790")
    assert not allowed("https://evil.example")
    assert not allowed("http://localhost.evil.example")
