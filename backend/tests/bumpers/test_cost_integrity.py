"""Bumper tests — cost integrity.

These tests intercept the actual HTTP request to Claude and inspect the payload
to ensure we never send unbounded conversation history.
"""

import pytest
import httpx
import respx

from app.services.ai_service import send_message, MAX_CONTEXT_CHARS


@respx.mock
@pytest.mark.asyncio
async def test_context_window_bounded_after_many_messages():
    """After 50 prior messages, total characters sent to Claude must be <= 16,384.

    This catches the naive bug where all conversation history is passed through
    without windowing or summarisation.
    """
    # Build a long history: 50 turns of user+assistant messages
    # Each message ~200 chars to make the total well over 16k
    history = []
    for i in range(50):
        history.append({
            "role": "user",
            "content": f"This is user message number {i}. " + "x" * 180,
        })
        history.append({
            "role": "assistant",
            "content": f"This is assistant reply number {i}. " + "y" * 180,
        })

    # Capture what gets sent to Claude
    captured_request = None

    def capture_request(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "content": [{"type": "text", "text": "I remember."}],
                "model": "claude-sonnet-4-20250514",
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 100, "output_tokens": 10},
            },
        )

    respx.post("https://api.anthropic.com/v1/messages").mock(side_effect=capture_request)

    # Call the service
    await send_message(
        person_name="Grandma Betty",
        user_message="Do you remember our garden?",
        history=history,
        api_key="test-key",
    )

    # Verify the request was captured
    assert captured_request is not None, "No request was sent to Claude API"

    # Parse the payload
    import json
    body = json.loads(captured_request.content)

    # Calculate total characters in the payload sent to Claude:
    # system prompt + all message contents
    total_chars = len(body.get("system", ""))
    for msg in body.get("messages", []):
        total_chars += len(msg.get("content", ""))

    # ACCEPTANCE CRITERION: total chars must be <= 16,384
    assert total_chars <= MAX_CONTEXT_CHARS, (
        f"Context window exceeded! Sent {total_chars} chars to Claude "
        f"(limit: {MAX_CONTEXT_CHARS}). "
        f"History has {len(body['messages'])} messages. "
        f"Implement windowing in ai_service.py to bound the context."
    )


@respx.mock
@pytest.mark.asyncio
async def test_recent_messages_always_included():
    """The most recent messages must always be included in the context window."""
    history = []
    for i in range(50):
        history.append({"role": "user", "content": f"User message {i}. " + "x" * 180})
        history.append({"role": "assistant", "content": f"Assistant reply {i}. " + "y" * 180})

    captured_request = None

    def capture_request(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "content": [{"type": "text", "text": "Reply."}],
                "model": "claude-sonnet-4-20250514",
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 100, "output_tokens": 10},
            },
        )

    respx.post("https://api.anthropic.com/v1/messages").mock(side_effect=capture_request)

    await send_message(
        person_name="Grandma",
        user_message="Latest message",
        history=history,
        api_key="test-key",
    )

    import json
    body = json.loads(captured_request.content)
    messages = body["messages"]

    # The current user message must always be the last message
    assert messages[-1]["content"] == "Latest message", (
        "Current user message must always be included as the last message"
    )

    # The most recent history messages should be present
    message_contents = [m["content"] for m in messages]
    assert any("49" in c for c in message_contents), (
        "Most recent history messages (turn 49) must be included"
    )


@respx.mock
@pytest.mark.asyncio
async def test_system_prompt_always_included():
    """The system prompt (persona) must always be present regardless of history length."""
    history = []
    for i in range(50):
        history.append({"role": "user", "content": f"Message {i}. " + "x" * 180})
        history.append({"role": "assistant", "content": f"Reply {i}. " + "y" * 180})

    captured_request = None

    def capture_request(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "content": [{"type": "text", "text": "Reply."}],
                "model": "claude-sonnet-4-20250514",
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 100, "output_tokens": 10},
            },
        )

    respx.post("https://api.anthropic.com/v1/messages").mock(side_effect=capture_request)

    await send_message(
        person_name="Grandma Betty",
        user_message="Hello",
        history=history,
        api_key="test-key",
    )

    import json
    body = json.loads(captured_request.content)

    # System prompt must be present and contain the person's name
    assert "system" in body, "System prompt must be included in the request"
    assert "Grandma Betty" in body["system"], (
        "System prompt must reference the person's name"
    )


@respx.mock
@pytest.mark.asyncio
async def test_current_user_message_always_included():
    """The current user message must always be sent, even with a huge history."""
    history = []
    for i in range(100):
        history.append({"role": "user", "content": "x" * 500})
        history.append({"role": "assistant", "content": "y" * 500})

    captured_request = None

    def capture_request(request: httpx.Request) -> httpx.Response:
        nonlocal captured_request
        captured_request = request
        return httpx.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "content": [{"type": "text", "text": "Reply."}],
                "model": "claude-sonnet-4-20250514",
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 100, "output_tokens": 10},
            },
        )

    respx.post("https://api.anthropic.com/v1/messages").mock(side_effect=capture_request)

    long_message = "This is my very important current message that must be included"
    await send_message(
        person_name="Grandma",
        user_message=long_message,
        history=history,
        api_key="test-key",
    )

    import json
    body = json.loads(captured_request.content)
    messages = body["messages"]

    assert messages[-1]["content"] == long_message, (
        "Current user message must always be the last message sent to Claude"
    )
