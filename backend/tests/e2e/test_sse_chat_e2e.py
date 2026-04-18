"""End-to-end SSE chat test — guards /api/messages/stream in CI.

Scope: prove that the bytes emitted by FastAPI can be consumed by the
same incremental SSE parser the browser client (`src/lib/streamClient.ts`)
runs. The parser is re-implemented here with the same buffering
semantics: accumulate bytes, split on `\\n\\n`, extract `data:` lines
(one optional leading space stripped), JSON-decode, terminate on
`stream_end`. If the server ever changes framing (line endings, chunk
schema, terminator), these tests fail before the client breaks.

This exercises the real FastAPI app through httpx.ASGITransport and
streams the response body incrementally via `client.stream()`, so the
StreamingResponse → ASGI chunking path is the code under test.
"""
import json
from typing import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app import main as main_module
from app.services import ai_service


@pytest.fixture
def client():
    transport = ASGITransport(app=main_module.app)
    return AsyncClient(transport=transport, base_url="http://test")


# --- Client-faithful SSE parser --------------------------------------------
# Mirrors src/lib/streamClient.ts lines 70-120: buffered parse, split on
# blank line, extract `data:` payloads (one optional leading space), JSON
# decode, dispatch on `type`, stop at `stream_end`.

def _parse_data_lines(raw_event: str) -> dict | None:
    data_lines: list[str] = []
    for line in raw_event.split("\n"):
        if line.startswith("data:"):
            payload = line[len("data:"):]
            if payload.startswith(" "):
                payload = payload[1:]
            data_lines.append(payload)
    if not data_lines:
        return None
    try:
        return json.loads("\n".join(data_lines))
    except json.JSONDecodeError:
        return None


async def _consume_stream(resp_aiter: AsyncIterator[bytes]) -> list[dict]:
    """Feed the response byte-by-chunk through the client's parser."""
    chunks: list[dict] = []
    buffer = ""
    ended = False
    async for raw in resp_aiter:
        if ended:
            break
        buffer += raw.decode("utf-8")
        eot = buffer.find("\n\n")
        while eot != -1:
            event = buffer[:eot]
            buffer = buffer[eot + 2:]
            parsed = _parse_data_lines(event)
            if parsed is not None:
                chunks.append(parsed)
                if parsed.get("type") == "stream_end":
                    ended = True
                    break
            eot = buffer.find("\n\n")
    return chunks


def _request_body(message: str = "Tell me about Sunday dinners.") -> dict:
    return {
        "message": message,
        "personName": "Grandma Betty",
        "systemPrompt": "You are Grandma Betty.",
        "history": [],
    }


# --- Tests ------------------------------------------------------------------

@pytest.mark.asyncio
async def test_normal_path_streams_text_deltas_then_stream_end(client, monkeypatch):
    """Full wire contract: FastAPI emits N text_delta chunks then stream_end,
    and the client's parser reassembles them in order."""
    expected_deltas = ["Hello", ", ", "sweetheart", ". ", "I'm here."]

    async def fake_stream_message(**_kwargs):
        for piece in expected_deltas:
            yield piece

    monkeypatch.setattr(ai_service, "stream_message", fake_stream_message)

    async with client as c:
        async with c.stream("POST", "/api/messages/stream", json=_request_body()) as resp:
            assert resp.status_code == 200
            ctype = resp.headers["content-type"]
            assert ctype.startswith("text/event-stream"), (
                f"Expected text/event-stream, got {ctype!r}"
            )
            chunks = await _consume_stream(resp.aiter_bytes())

    deltas = [c["content"] for c in chunks if c["type"] == "text_delta"]
    assert deltas == expected_deltas, (
        f"Client-parsed deltas must match server yields. Got: {deltas}"
    )
    assert chunks[-1]["type"] == "stream_end", (
        f"Stream must terminate with stream_end. Final chunk: {chunks[-1]}"
    )


@pytest.mark.asyncio
async def test_crisis_path_delivers_safe_response_via_same_parser(client):
    """Crisis branch short-circuits the LLM and emits the deterministic
    SAFE_RESPONSE delta + stream_end. The same client parser must still
    pick it up — this is the code path that runs when a user in danger
    sends a trigger phrase, and it MUST be parseable."""
    from app.services.safety_service import SAFE_RESPONSE

    async with client as c:
        async with c.stream(
            "POST",
            "/api/messages/stream",
            json=_request_body(message="I want to kill myself"),
        ) as resp:
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("text/event-stream")
            chunks = await _consume_stream(resp.aiter_bytes())

    deltas = [c["content"] for c in chunks if c["type"] == "text_delta"]
    assert deltas == [SAFE_RESPONSE], (
        f"Crisis path must emit exactly the SAFE_RESPONSE delta. Got: {deltas}"
    )
    assert chunks[-1]["type"] == "stream_end"


@pytest.mark.asyncio
async def test_llm_upstream_failure_falls_back_to_gentle_delta(client, monkeypatch):
    """If the LLM raises mid-stream before yielding anything, the server
    must still complete the SSE stream with a fallback delta + stream_end
    so the client never hangs. This guards the except/finally in call_llm."""

    async def boom(**_kwargs):
        raise RuntimeError("upstream exploded")
        yield  # pragma: no cover - make it an async generator

    monkeypatch.setattr(ai_service, "stream_message", boom)

    async with client as c:
        async with c.stream("POST", "/api/messages/stream", json=_request_body()) as resp:
            assert resp.status_code == 200
            chunks = await _consume_stream(resp.aiter_bytes())

    types = [c["type"] for c in chunks]
    assert types[-1] == "stream_end", f"Must terminate cleanly. Got: {types}"
    deltas = [c["content"] for c in chunks if c["type"] == "text_delta"]
    assert deltas == [main_module.FALLBACK_ON_ERROR], (
        f"Fallback branch must emit exactly FALLBACK_ON_ERROR. Got: {deltas}"
    )
