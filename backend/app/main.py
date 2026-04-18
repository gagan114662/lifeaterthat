import json
import logging
import tomllib
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import StreamingResponse

_pyproject = Path(__file__).parent.parent / "pyproject.toml"
with _pyproject.open("rb") as _f:
    _VERSION: str = tomllib.load(_f)["project"]["version"]

from app.api.upload import router as upload_router
from app.api.memories import router as memories_router
from app.models.stream import MessageRequest
from app.services import ai_service
from app.services.persona_service import build_system_prompt
from app.services.safety_service import is_crisis_message, SAFE_RESPONSE

logger = logging.getLogger(__name__)

app = FastAPI(title="Afterlife API")
app.include_router(upload_router)
app.include_router(memories_router)

FALLBACK_ON_ERROR = (
    "I love you, sweetheart. I hear you. I'm always here for you."
)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": _VERSION,
    }


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def _stream_safe_response():
    """Yield the deterministic crisis response as SSE chunks."""
    yield _sse({"type": "text_delta", "content": SAFE_RESPONSE})
    yield _sse({"type": "stream_end", "content": ""})


async def call_llm(request: MessageRequest):
    """Stream a persona reply from Claude as SSE events.

    Each text delta becomes a `text_delta` SSE event; the stream ends
    with a single `stream_end` event. On upstream failure we emit a
    gentle fallback delta followed by `stream_end` so the client never
    hangs mid-stream.
    """
    system_prompt = request.systemPrompt or build_system_prompt(request.personName)

    emitted_any = False
    try:
        async for delta in ai_service.stream_message(
            person_name=request.personName,
            user_message=request.message,
            history=request.history,
            system_prompt=system_prompt,
        ):
            if not delta:
                continue
            emitted_any = True
            yield _sse({"type": "text_delta", "content": delta})
    except Exception:
        logger.exception("LLM stream failed")
        if not emitted_any:
            yield _sse({"type": "text_delta", "content": FALLBACK_ON_ERROR})

    yield _sse({"type": "stream_end", "content": ""})


@app.post("/api/messages/stream")
async def stream_messages(request: MessageRequest):
    # === SAFETY CHECK — runs BEFORE any LLM call ===
    if is_crisis_message(request.message):
        logger.warning("Crisis message detected (no PII logged)")
        return StreamingResponse(
            _stream_safe_response(),
            media_type="text/event-stream",
        )

    # Normal path — call the LLM
    return StreamingResponse(
        call_llm(request),
        media_type="text/event-stream",
    )
