from fastapi.testclient import TestClient

import tracing
import translate_server as server


def test_names_each_jev_call_by_its_question():
    assert tracing.name({"requires_finnish": {}}) == "finnish-fast"
    assert tracing.name({"requires_finnish": {}, "fi_s0": {}, "en_s0": {}}) == "finnish-sentences"
    assert tracing.name({"description": {}}) == "pick-description"
    assert tracing.name({"apply": {}}) == "pick-apply"
    assert tracing.name({"confirm": {}}) == "confirm-apply"
    assert tracing.name({"other": {}}) == "other"


def test_maps_upstream_usage_to_langfuse_keys():
    assert tracing.usage({"usage": {"input_tokens": 120, "output_tokens": 4}}) == {"input": 120, "output": 4}
    assert tracing.usage({"usage": {"input_tokens": 7}}) == {"input": 7}
    assert tracing.usage({"answers": {}}) == {}
    assert tracing.usage("oops") == {}


def test_off_without_keys_is_a_no_op():
    assert not tracing.enabled()
    with tracing.generation({}, {}, {"q": {}}, "jev-latest") as done:
        done(200, b"{}")


def test_cors_allows_trace_headers():
    res = TestClient(server.app).options(
        "/jev",
        headers={
            "origin": "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type,x-jf-session,x-jf-flow,x-jf-url",
        },
    )
    assert res.status_code == 200
