"""Supabase JWT auth dependency.

All protected routes depend on :func:`get_current_user`, which:
  - Reads the Authorization header.
  - Requires the "Bearer " scheme.
  - Verifies the JWT signature with the project's Supabase JWT secret
    (HS256 — Supabase's default for access tokens).
  - Returns a plain dict ``{"id": ..., "email": ...}`` on success.
  - Raises :class:`UnauthorizedError`, which the app-level handler
    converts to a 401 response with body ``{"error": "Unauthorized"}``.

Tests may monkeypatch :func:`verify_supabase_jwt` to avoid signing real
tokens.
"""
from __future__ import annotations

import os
from typing import Any

import jwt
from fastapi import Header, Request


class AuthError(Exception):
    """Raised by :func:`verify_supabase_jwt` when a token is not usable."""


class UnauthorizedError(Exception):
    """Raised by :func:`get_current_user` to trigger a 401 response.

    The app's exception handler renders this as ``{"error": "Unauthorized"}``
    with status 401 — the exact contract the frontend and bumper tests
    rely on.
    """


def verify_supabase_jwt(token: str) -> dict[str, Any]:
    """Verify a Supabase access token and return the user payload.

    Supabase signs access tokens with HS256 and the project's
    ``SUPABASE_JWT_SECRET``. The ``sub`` claim is the user's UUID and
    ``email`` is present for password / magic-link users.
    """
    secret = os.environ.get("SUPABASE_JWT_SECRET")
    if not secret:
        raise AuthError("SUPABASE_JWT_SECRET is not configured")

    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"invalid token: {exc}") from exc

    return {"id": claims["sub"], "email": claims.get("email")}


async def get_current_user(
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """FastAPI dependency that resolves the current Supabase user.

    Missing header, malformed scheme, and any verification failure all
    collapse to a 401. The specific failure reason is not leaked.
    """
    if not authorization:
        raise UnauthorizedError()

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise UnauthorizedError()

    try:
        return verify_supabase_jwt(token)
    except AuthError:
        raise UnauthorizedError()


async def optional_current_user(request: Request) -> dict[str, Any] | None:
    """Soft variant used by endpoints that log the caller when known."""
    header = request.headers.get("authorization")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        return verify_supabase_jwt(token)
    except AuthError:
        return None
