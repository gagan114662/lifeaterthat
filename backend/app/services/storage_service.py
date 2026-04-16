"""Supabase Storage wrapper for photo and voice-sample uploads.

Two public buckets are used:
  - afterlife-photos          profile photos
  - afterlife-voice-samples   voice-cloning inputs

Configuration is read from the environment:
  SUPABASE_URL            e.g. https://xyz.supabase.co
  SUPABASE_SERVICE_KEY    service-role key (write access to Storage)

If either is unset the service raises so callers fail loudly rather
than silently dropping uploads. Tests should monkeypatch :func:`upload`.
"""
from __future__ import annotations

import os
import uuid
from pathlib import PurePosixPath

import httpx

PHOTO_BUCKET = "afterlife-photos"
AUDIO_BUCKET = "afterlife-voice-samples"

_MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/wave": ".wav",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
}


class StorageError(RuntimeError):
    """Raised when the Storage API call fails."""


def _extension(content_type: str, filename: str) -> str:
    if content_type in _MIME_EXTENSIONS:
        return _MIME_EXTENSIONS[content_type]
    suffix = PurePosixPath(filename).suffix.lower()
    return suffix if suffix else ".bin"


async def upload(bucket: str, data: bytes, content_type: str, filename: str) -> str:
    """Upload *data* to *bucket* and return the public URL.

    Object keys are a fresh UUID plus an extension inferred from the
    content-type (falling back to the filename suffix).
    """
    base_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not base_url or not service_key:
        raise StorageError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set to upload files"
        )

    object_key = f"{uuid.uuid4()}{_extension(content_type, filename)}"
    endpoint = f"{base_url.rstrip('/')}/storage/v1/object/{bucket}/{object_key}"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            endpoint,
            headers={
                "authorization": f"Bearer {service_key}",
                "apikey": service_key,
                "content-type": content_type,
                "x-upsert": "false",
            },
            content=data,
            timeout=30.0,
        )
    if resp.status_code >= 400:
        raise StorageError(
            f"Supabase Storage upload failed: {resp.status_code} {resp.text}"
        )

    return f"{base_url.rstrip('/')}/storage/v1/object/public/{bucket}/{object_key}"
