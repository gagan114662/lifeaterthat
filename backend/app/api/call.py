"""Voice call endpoint — auth-gated stub.

The real voice-call plumbing (WebRTC / Twilio) lands in a later issue.
For now the route exists so the auth contract is enforceable end-to-end:
unauthenticated callers must see 401, authenticated callers get a 501
``not implemented`` with their own user id echoed for debugging.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user


router = APIRouter(prefix="/api/call", tags=["call"])


@router.post("")
async def start_call(current_user: dict = Depends(get_current_user)):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail={"error": "call endpoint not yet implemented",
                "user_id": current_user["id"]},
    )
