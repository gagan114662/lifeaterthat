"""Memories API — per-user CRUD, RLS-style isolation.

Rows belong to their owning user via ``user_id``. Every handler filters
by ``current_user["id"]`` so a missing row and a row owned by someone
else both collapse to the same 404 — the same surface the real
Supabase RLS policy (``user_id = auth.uid()``) produces at the DB
layer.

The current store is an in-memory dict so the bumper tests and local
dev can exercise the auth + isolation contract without a running
Postgres. Production swaps this for supabase-py queries that rely on
the RLS policy in ``infra/supabase/seed.sql``; the route handlers
should not need to change.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_current_user


router = APIRouter(prefix="/api/memories", tags=["memories"])

# Replaced in production by a Supabase query; see module docstring.
_MEMORIES: dict[str, dict[str, Any]] = {}


def _rows_for(user_id: str) -> list[dict[str, Any]]:
    return [row for row in _MEMORIES.values() if row.get("user_id") == user_id]


@router.get("")
async def list_memories(
    current_user: dict = Depends(get_current_user),
) -> dict[str, list[dict[str, Any]]]:
    return {"memories": _rows_for(current_user["id"])}


@router.get("/{memory_id}")
async def get_memory(
    memory_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    row = _MEMORIES.get(memory_id)
    if row is None or row.get("user_id") != current_user["id"]:
        # Cross-user access is indistinguishable from "not found" — the
        # RLS pattern. Returning 403 here would leak existence.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return row
