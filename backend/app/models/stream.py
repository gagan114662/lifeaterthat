from pydantic import BaseModel


class MessageRequest(BaseModel):
    message: str
    personName: str
    history: list[dict] = []
    systemPrompt: str | None = None


class StreamChunk(BaseModel):
    type: str  # "text_delta" | "stream_end"
    content: str = ""
