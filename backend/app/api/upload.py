"""Upload endpoints for onboarding assets.

POST /api/upload/photo  -> multipart form field "file" (image/*, <=10MB)
POST /api/upload/audio  -> multipart form field "file" (audio/*, <=50MB, >=3s)

Both endpoints return {"url": "https://..."} pointing at the uploaded
object in Supabase Storage. Returns 413 for oversized uploads and
422 for wrong MIME types, malformed audio headers, or voice samples
shorter than the 3-second minimum required by the voice-cloning flow.
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.deps import get_current_user
from app.services import storage_service
from testing_utils import audio as audio_utils

router = APIRouter(prefix="/api/upload", tags=["upload"])

MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_AUDIO_BYTES = 50 * 1024 * 1024
MIN_AUDIO_SECONDS = 3.0


@router.post("/photo")
async def upload_photo(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="file must be an image")

    data = await file.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="photo exceeds 10MB limit")

    url = await storage_service.upload(
        storage_service.PHOTO_BUCKET,
        data,
        content_type,
        file.filename or "photo",
    )
    return {"url": url}


@router.post("/audio")
async def upload_audio(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("audio/"):
        raise HTTPException(status_code=422, detail="file must be audio")

    data = await file.read()
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="audio exceeds 50MB limit")

    if not audio_utils.has_valid_audio_header(data):
        raise HTTPException(
            status_code=422,
            detail="audio must be a WAV or WebM file",
        )

    duration = audio_utils.audio_duration_seconds(data)
    if duration < MIN_AUDIO_SECONDS:
        raise HTTPException(
            status_code=422,
            detail=f"voice sample must be at least {MIN_AUDIO_SECONDS:.0f} seconds",
        )

    url = await storage_service.upload(
        storage_service.AUDIO_BUCKET,
        data,
        content_type,
        file.filename or "voice",
    )
    return {"url": url}
