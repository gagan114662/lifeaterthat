"""
Bumper tests — Stream Completeness (Issue #1)

Verifies the SSE wire contract of /api/messages/stream for normal
(non-crisis) messages: status code, terminal stream_end event, at
least one non-empty text_delta, and schema-conformant chunks.
"""
import json
from typing import Iterable

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.stream import StreamChunk


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


def parse_sse_chunks(body: str) -> list[dict]:
    """Parse a text/event-stream body into a list of JSON payloads."""
    chunks: list[dict] = []
    for event in body.split("\n\n"):
        event = event.strip()
        if not event:
            continue
        for line in event.splitlines():
            if line.startswith("data:"):
                payload = line[len("data:"):].lstrip()
                chunks.append(json.loads(payload))
    return chunks


def _normal_request_body(message: str = "I miss you, grandma") -> dict:
    return {
        "message": message,
        "personName": "Grandma Betty",
        "history": [],
    }


@pytest.mark.asyncio
async def test_stream_endpoint_returns_200(client):
    resp = await client.post("/api/messages/stream", json=_normal_request_body())
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")


@pytest.mark.asyncio
async def test_stream_ends_with_stream_end_event(client):
    resp = await client.post("/api/messages/stream", json=_normal_request_body())
    chunks = parse_sse_chunks(resp.text)
    assert len(chunks) >= 1, f"Expected at least one SSE event; got: {resp.text[:200]}"
    assert chunks[-1]["type"] == "stream_end", (
        f"Final chunk must be stream_end. Got: {chunks[-1]}"
    )


@pytest.mark.asyncio
async def test_stream_contains_non_empty_text_delta(client):
    resp = await client.post("/api/messages/stream", json=_normal_request_body())
    chunks = parse_sse_chunks(resp.text)
    deltas = [c for c in chunks if c.get("type") == "text_delta"]
    assert len(deltas) >= 1, f"Expected >= 1 text_delta chunk; got chunks: {chunks}"
    assert any(c.get("content", "").strip() for c in deltas), (
        f"Expected at least one non-empty text_delta. Got deltas: {deltas}"
    )


@pytest.mark.asyncio
async def test_all_stream_chunks_match_schema(client):
    resp = await client.post("/api/messages/stream", json=_normal_request_body())
    chunks = parse_sse_chunks(resp.text)
    for raw in chunks:
        # Every chunk must be a valid StreamChunk
        model = StreamChunk.model_validate(raw)
        assert model.type in {"text_delta", "stream_end"}, (
            f"Unknown chunk type: {model.type!r} in {raw}"
        )
