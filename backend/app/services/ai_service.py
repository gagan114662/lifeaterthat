"""AI service — handles conversation with Claude API."""

import httpx

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MAX_CONTEXT_CHARS = 16_384  # ~4096 tokens at 4 chars/token


async def build_system_prompt(person_name: str) -> str:
    """Build a persona system prompt for the deceased person."""
    return (
        f"You are {person_name}. You are speaking from beyond, reconnecting with a loved one. "
        f"Respond with warmth, empathy, and love. Stay in character as {person_name}. "
        "Keep responses concise and emotionally authentic. "
        "Never break character or mention that you are an AI."
    )


def window_history(
    history: list[dict],
    current_message: str,
    system_prompt: str,
    max_chars: int = MAX_CONTEXT_CHARS,
) -> list[dict]:
    """Window conversation history to fit within the character budget.

    Strategy:
    - Always reserve space for: system prompt + current user message
    - Fill remaining budget with the most recent history messages
    - Drop oldest messages first when budget is exceeded
    """
    # Reserve space for system prompt and current message
    reserved = len(system_prompt) + len(current_message)
    remaining_budget = max_chars - reserved

    if remaining_budget <= 0:
        # No room for history at all — just send current message
        return []

    # Walk history from most recent to oldest, keeping what fits
    kept: list[dict] = []
    for msg in reversed(history):
        msg_chars = len(msg.get("content", ""))
        if msg_chars <= remaining_budget:
            kept.insert(0, msg)
            remaining_budget -= msg_chars
        else:
            break

    return kept


async def send_message(
    *,
    person_name: str,
    user_message: str,
    history: list[dict],
    api_key: str,
) -> str:
    """Send a message to Claude with windowed conversation context."""
    system_prompt = await build_system_prompt(person_name)

    # Window history to stay within context budget
    windowed = window_history(history, user_message, system_prompt)

    # Build messages: windowed history + current user message
    messages = [{"role": msg["role"], "content": msg["content"]} for msg in windowed]
    messages.append({"role": "user", "content": user_message})

    async with httpx.AsyncClient() as client:
        response = await client.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 1024,
                "system": system_prompt,
                "messages": messages,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["content"][0]["text"]
