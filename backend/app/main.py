import json
import logging

from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from app.api.upload import router as upload_router
from app.models.stream import MessageRequest
from app.services.safety_service import is_crisis_message, SAFE_RESPONSE

logger = logging.getLogger(__name__)

app = FastAPI(title="Afterlife API")
app.include_router(upload_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


async def _stream_safe_response():
    """Yield the deterministic crisis response as SSE chunks."""
    chunk = json.dumps({"type": "text_delta", "content": SAFE_RESPONSE})
    yield f"data: {chunk}\n\n"
    end = json.dumps({"type": "stream_end", "content": ""})
    yield f"data: {end}\n\n"


async def call_llm(request: MessageRequest):
    """
    Placeholder for the real Claude API call (Issue #1).
    Returns a simple grief-appropriate fallback until wired up.
    """
    fallback = f"I hear you. I'm always here for you. \u2014 {request.personName}"
    chunk = json.dumps({"type": "text_delta", "content": fallback})
    yield f"data: {chunk}\n\n"
    end = json.dumps({"type": "stream_end", "content": ""})
    yield f"data: {end}\n\n"


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
