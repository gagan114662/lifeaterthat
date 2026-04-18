"""Minimal memory persistence routes for the onboarding flow."""

from __future__ import annotations

from itertools import count
from threading import Lock

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/memories", tags=["memories"])


class MemoryCreate(BaseModel):
    name: str
    photoUrl: str
    voiceSampleUrl: str


_lock = Lock()
_next_id = count(1)
_memories: list[dict[str, str]] = []


@router.post("")
async def create_memory(payload: MemoryCreate):
    with _lock:
        memory = {
            "id": f"mem-{next(_next_id):04d}",
            "name": payload.name,
            "photoUrl": payload.photoUrl,
            "voiceSampleUrl": payload.voiceSampleUrl,
        }
        _memories.append(memory)
    return memory

