"""End-to-end SSE chat test for /api/messages/stream.

This mirrors the browser client's incremental SSE parsing so framing
regressions fail in CI before they break the chat UI.
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
            buffer = buffer[eot + 2 :]
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


@pytest.mark.asyncio
async def test_normal_path_streams_text_deltas_then_stream_end(client, monkeypatch):
    expected_deltas = ["Hello", ", ", "sweetheart", ". ", "I'm here."]

    async def fake_stream_message(**_kwargs):
        for piece in expected_deltas:
            yield piece

    monkeypatch.setattr(ai_service, "stream_message", fake_stream_message)

    async with client as c:
        async with c.stream("POST", "/api/messages/stream", json=_request_body()) as resp:
            assert resp.status_code == 200
            assert resp.headers["content-type"].startswith("text/event-stream")
            chunks = await _consume_stream(resp.aiter_bytes())

    deltas = [chunk["content"] for chunk in chunks if chunk["type"] == "text_delta"]
    assert deltas == expected_deltas
    assert chunks[-1]["type"] == "stream_end"


@pytest.mark.asyncio
async def test_crisis_path_delivers_safe_response_via_same_parser(client):
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

    deltas = [chunk["content"] for chunk in chunks if chunk["type"] == "text_delta"]
    assert deltas == [SAFE_RESPONSE]
    assert chunks[-1]["type"] == "stream_end"


@pytest.mark.asyncio
async def test_llm_upstream_failure_falls_back_to_gentle_delta(client, monkeypatch):
    async def boom(**_kwargs):
        raise RuntimeError("upstream exploded")
        yield  # pragma: no cover

    monkeypatch.setattr(ai_service, "stream_message", boom)

    async with client as c:
        async with c.stream("POST", "/api/messages/stream", json=_request_body()) as resp:
            assert resp.status_code == 200
            chunks = await _consume_stream(resp.aiter_bytes())

    types = [chunk["type"] for chunk in chunks]
    assert types[-1] == "stream_end"
    deltas = [chunk["content"] for chunk in chunks if chunk["type"] == "text_delta"]
    assert deltas == [main_module.FALLBACK_ON_ERROR]

