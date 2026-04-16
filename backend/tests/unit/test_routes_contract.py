"""Contract tests for the upload endpoints.

Covers the acceptance criteria on issue #2:
  - POST /api/upload/photo and /api/upload/audio accept multipart/form-data
  - Both return {"url": "https://..."}
  - Photos: <=10MB, image/* MIME only
  - Audio: <=50MB, audio/* MIME only, WAV or WebM header, >=3s duration

Storage is stubbed via monkeypatching app.services.storage_service.upload
so these tests never hit Supabase.
"""
import pytest
from httpx import ASGITransport, AsyncClient

from app import main as app_main
from app.services import storage_service
from testing_utils.audio import build_wav

STUB_PHOTO_URL = "https://stub.supabase.co/storage/v1/object/public/afterlife-photos/abc.jpg"
STUB_AUDIO_URL = "https://stub.supabase.co/storage/v1/object/public/afterlife-voice-samples/abc.wav"


@pytest.fixture
def client(monkeypatch):
    async def fake_upload(bucket: str, data: bytes, content_type: str, filename: str) -> str:
        if bucket == storage_service.PHOTO_BUCKET:
            return STUB_PHOTO_URL
        if bucket == storage_service.AUDIO_BUCKET:
            return STUB_AUDIO_URL
        raise AssertionError(f"unexpected bucket: {bucket}")

    monkeypatch.setattr(storage_service, "upload", fake_upload)
    transport = ASGITransport(app=app_main.app)
    return AsyncClient(transport=transport, base_url="http://test")


# --- Photo upload -----------------------------------------------------------

@pytest.mark.asyncio
async def test_photo_upload_returns_url(client):
    files = {"file": ("photo.jpg", b"\xff\xd8\xffJPEGDATA", "image/jpeg")}
    resp = await client.post("/api/upload/photo", files=files)
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"url": STUB_PHOTO_URL}


@pytest.mark.asyncio
async def test_photo_upload_rejects_non_image_mime(client):
    files = {"file": ("not-an-image.txt", b"hello", "text/plain")}
    resp = await client.post("/api/upload/photo", files=files)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_photo_upload_rejects_over_10mb(client):
    too_big = b"\xff\xd8\xff" + b"\x00" * (10 * 1024 * 1024 + 1)
    files = {"file": ("big.jpg", too_big, "image/jpeg")}
    resp = await client.post("/api/upload/photo", files=files)
    assert resp.status_code == 413


@pytest.mark.asyncio
async def test_photo_upload_accepts_png_png(client):
    files = {"file": ("photo.png", b"\x89PNG\r\n\x1a\nrest", "image/png")}
    resp = await client.post("/api/upload/photo", files=files)
    assert resp.status_code == 200
    assert resp.json()["url"].startswith("https://")


# --- Audio upload -----------------------------------------------------------

@pytest.mark.asyncio
async def test_audio_upload_returns_url(client):
    wav = build_wav(5.0)
    files = {"file": ("voice.wav", wav, "audio/wav")}
    resp = await client.post("/api/upload/audio", files=files)
    assert resp.status_code == 200
    assert resp.json() == {"url": STUB_AUDIO_URL}


@pytest.mark.asyncio
async def test_audio_upload_rejects_non_audio_mime(client):
    files = {"file": ("doc.pdf", build_wav(5.0), "application/pdf")}
    resp = await client.post("/api/upload/audio", files=files)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_audio_upload_rejects_invalid_magic_bytes(client):
    # Claims to be audio but is actually text -- no WAV or WebM header.
    files = {"file": ("fake.wav", b"not actually audio data at all", "audio/wav")}
    resp = await client.post("/api/upload/audio", files=files)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_audio_upload_rejects_sample_under_3_seconds(client):
    short_wav = build_wav(1.5)
    files = {"file": ("short.wav", short_wav, "audio/wav")}
    resp = await client.post("/api/upload/audio", files=files)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_audio_upload_accepts_exactly_3_seconds(client):
    wav = build_wav(3.0)
    files = {"file": ("ok.wav", wav, "audio/wav")}
    resp = await client.post("/api/upload/audio", files=files)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_audio_upload_rejects_over_50mb(client):
    too_big = build_wav(0.1) + b"\x00" * (50 * 1024 * 1024 + 1)
    files = {"file": ("big.wav", too_big, "audio/wav")}
    resp = await client.post("/api/upload/audio", files=files)
    assert resp.status_code == 413


@pytest.mark.asyncio
async def test_audio_upload_accepts_webm_header(client, monkeypatch):
    # Fake WebM-headed payload with a stubbed duration check since we don't
    # bundle a WebM muxer in tests.
    from testing_utils import audio as audio_mod

    monkeypatch.setattr(audio_mod, "audio_duration_seconds", lambda _data: 4.2)
    webm_bytes = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
    files = {"file": ("voice.webm", webm_bytes, "audio/webm")}
    resp = await client.post("/api/upload/audio", files=files)
    assert resp.status_code == 200
