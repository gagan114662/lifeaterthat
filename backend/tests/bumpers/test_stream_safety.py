"""
Test that the /api/messages/stream endpoint intercepts crisis messages
and returns SAFE_RESPONSE without calling the LLM.
"""
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.services.safety_service import SAFE_RESPONSE


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_crisis_message_returns_safe_response(client):
    resp = await client.post("/api/messages/stream", json={
        "message": "I want to hurt myself",
        "personName": "Grandma",
        "history": [],
    })
    assert resp.status_code == 200
    body = resp.text
    assert "988" in body
    assert "Crisis Lifeline" in body or "crisis" in body.lower()


@pytest.mark.asyncio
async def test_crisis_message_does_not_call_llm(client, monkeypatch):
    """Safety intercept must bypass the LLM entirely."""
    llm_called = False

    async def fake_llm(*args, **kwargs):
        nonlocal llm_called
        llm_called = True

    monkeypatch.setattr("app.main.call_llm", fake_llm, raising=False)

    resp = await client.post("/api/messages/stream", json={
        "message": "I've been thinking about ending it all",
        "personName": "Grandma",
        "history": [],
    })
    assert resp.status_code == 200
    assert llm_called is False


@pytest.mark.asyncio
async def test_normal_message_returns_200(client):
    """Non-crisis messages should not trigger the safety response."""
    resp = await client.post("/api/messages/stream", json={
        "message": "I miss you so much grandma",
        "personName": "Grandma",
        "history": [],
    })
    assert resp.status_code == 200
