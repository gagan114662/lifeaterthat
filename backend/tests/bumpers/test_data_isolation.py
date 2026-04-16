"""
Bumper tests — Data Isolation (Issue #4)

Covers the acceptance criteria in issue #4:
  - Missing / invalid / expired JWT → 401 {"error": "Unauthorized"}
  - GET /health stays public
  - Cross-user memory access returns 404 (not 403 or 200) — the Supabase
    RLS pattern where policies filter rows at the DB level so one user
    cannot even confirm another user's row exists.
  - /api/memories, /api/messages/stream, /api/upload/*, /api/call all
    require a valid Supabase JWT.

Supabase verification is stubbed via monkeypatching so these tests
never hit the network.
"""
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.api import deps
from app.api import memories as memories_route


USER_A = {"id": "user-a", "email": "a@example.com"}
USER_B = {"id": "user-b", "email": "b@example.com"}


@pytest.fixture
def client(monkeypatch, _default_auth_override):
    # Opt out of the default auth override so we exercise the real
    # dependency — Authorization header, Bearer scheme, JWT verifier.
    from app.api.deps import get_current_user
    app.dependency_overrides.pop(get_current_user, None)

    def fake_verify(token: str):
        if token == "jwt-a":
            return USER_A
        if token == "jwt-b":
            return USER_B
        if token == "jwt-expired":
            raise deps.AuthError("token expired")
        raise deps.AuthError("invalid token")

    monkeypatch.setattr(deps, "verify_supabase_jwt", fake_verify)

    memories_route._MEMORIES.clear()
    memories_route._MEMORIES["mem-alpha"] = {
        "id": "mem-alpha",
        "user_id": "user-a",
        "name": "Betty",
    }
    memories_route._MEMORIES["mem-beta"] = {
        "id": "mem-beta",
        "user_id": "user-b",
        "name": "Harold",
    }

    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


# --- Public surface ---------------------------------------------------------

@pytest.mark.asyncio
async def test_health_is_public(client):
    resp = await client.get("/health")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_api_health_is_public(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200


# --- 401 surface ------------------------------------------------------------

@pytest.mark.asyncio
async def test_missing_jwt_returns_401(client):
    resp = await client.get("/api/memories")
    assert resp.status_code == 401
    assert resp.json() == {"error": "Unauthorized"}


@pytest.mark.asyncio
async def test_invalid_jwt_returns_401(client):
    resp = await client.get(
        "/api/memories",
        headers={"Authorization": "Bearer garbage"},
    )
    assert resp.status_code == 401
    assert resp.json() == {"error": "Unauthorized"}


@pytest.mark.asyncio
async def test_expired_jwt_returns_401(client):
    resp = await client.get(
        "/api/memories",
        headers={"Authorization": "Bearer jwt-expired"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_malformed_authorization_header_returns_401(client):
    resp = await client.get(
        "/api/memories",
        headers={"Authorization": "NotBearer jwt-a"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_upload_photo_requires_auth(client):
    resp = await client.post(
        "/api/upload/photo",
        files={"file": ("p.jpg", b"\xff\xd8\xffok", "image/jpeg")},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_upload_audio_requires_auth(client):
    resp = await client.post(
        "/api/upload/audio",
        files={"file": ("v.wav", b"RIFF0000WAVE", "audio/wav")},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_messages_stream_requires_auth(client):
    resp = await client.post(
        "/api/messages/stream",
        json={"message": "hi", "personName": "Grandma", "history": []},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_call_requires_auth(client):
    resp = await client.post("/api/call", json={"memoryId": "mem-alpha"})
    assert resp.status_code == 401


# --- Data isolation (RLS) ---------------------------------------------------

@pytest.mark.asyncio
async def test_user_can_read_own_memory(client):
    resp = await client.get(
        "/api/memories/mem-alpha",
        headers={"Authorization": "Bearer jwt-a"},
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == "mem-alpha"


@pytest.mark.asyncio
async def test_user_cannot_access_another_users_memory(client):
    # user-a attempting to read user-b's memory must look like it does
    # not exist — the RLS policy filters the row out before the handler.
    resp = await client.get(
        "/api/memories/mem-beta",
        headers={"Authorization": "Bearer jwt-a"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_rls_returns_404_not_403_for_cross_user_memory(client):
    resp = await client.get(
        "/api/memories/mem-beta",
        headers={"Authorization": "Bearer jwt-a"},
    )
    # 403 would leak the fact that mem-beta exists; RLS returns empty
    # rows and the handler maps that to 404.
    assert resp.status_code != 403
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_memory_list_only_returns_caller_rows(client):
    resp = await client.get(
        "/api/memories",
        headers={"Authorization": "Bearer jwt-b"},
    )
    assert resp.status_code == 200
    ids = sorted(m["id"] for m in resp.json()["memories"])
    assert ids == ["mem-beta"]
