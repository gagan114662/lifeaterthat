"""Audio file validation helpers.

Used by the /api/upload/audio endpoint to reject non-audio uploads and
voice samples too short for cloning. Supports WAV (RIFF/WAVE) and
WebM (EBML / Matroska) containers -- the two formats the web MediaRecorder
and the file upload flow are expected to produce.
"""
import struct

WAV_RIFF = b"RIFF"
WAV_WAVE = b"WAVE"
WEBM_EBML = b"\x1a\x45\xdf\xa3"


def has_valid_audio_header(data: bytes) -> bool:
    """Return True if *data* starts with a WAV or WebM magic header."""
    if len(data) < 12:
        return False
    if data[:4] == WAV_RIFF and data[8:12] == WAV_WAVE:
        return True
    if data[:4] == WEBM_EBML:
        return True
    return False


def audio_duration_seconds(data: bytes) -> float:
    """Return the audio duration in seconds, or 0.0 if unknown."""
    if len(data) >= 12 and data[:4] == WAV_RIFF and data[8:12] == WAV_WAVE:
        return _wav_duration(data)
    if len(data) >= 4 and data[:4] == WEBM_EBML:
        return _webm_duration(data)
    return 0.0


# --- WAV ---------------------------------------------------------------------

def _wav_duration(data: bytes) -> float:
    offset = 12
    byte_rate = 0
    data_size = 0
    while offset + 8 <= len(data):
        chunk_id = data[offset:offset + 4]
        (chunk_size,) = struct.unpack("<I", data[offset + 4:offset + 8])
        payload = offset + 8
        if chunk_id == b"fmt " and chunk_size >= 16 and payload + 16 <= len(data):
            (byte_rate,) = struct.unpack("<I", data[payload + 8:payload + 12])
        elif chunk_id == b"data":
            data_size = chunk_size
            break
        offset = payload + chunk_size + (chunk_size & 1)

    if byte_rate <= 0 or data_size <= 0:
        return 0.0
    return data_size / byte_rate


def build_wav(duration_seconds: float, sample_rate: int = 8000) -> bytes:
    """Synthesize a silent 8-bit mono WAV of the given duration (test helper)."""
    num_samples = max(0, int(round(duration_seconds * sample_rate)))
    data = b"\x80" * num_samples  # 8-bit unsigned silence
    fmt_chunk = struct.pack(
        "<4sIHHIIHH",
        b"fmt ", 16,
        1,                  # PCM
        1,                  # channels
        sample_rate,
        sample_rate,        # byte rate
        1,                  # block align
        8,                  # bits per sample
    )
    data_chunk = struct.pack("<4sI", b"data", len(data)) + data
    riff_size = 4 + len(fmt_chunk) + len(data_chunk)
    return struct.pack("<4sI4s", b"RIFF", riff_size, b"WAVE") + fmt_chunk + data_chunk


# --- WebM / EBML -------------------------------------------------------------

def _webm_duration(data: bytes) -> float:
    pos = 0
    hdr = _read_vint(data, pos)
    if hdr is None:
        return 0.0
    pos += hdr[1]
    hdr_size = _read_vint(data, pos, strip_marker=True)
    if hdr_size is None:
        return 0.0
    pos += hdr_size[1] + hdr_size[0]

    seg = _read_vint(data, pos)
    if seg is None or seg[0] != 0x18538067:
        return 0.0
    pos += seg[1]
    seg_size = _read_vint(data, pos, strip_marker=True)
    if seg_size is None:
        return 0.0
    pos += seg_size[1]
    unknown_size = (1 << (7 * seg_size[1])) - 1
    seg_end = len(data) if seg_size[0] == unknown_size else pos + seg_size[0]

    timestamp_scale = 1_000_000
    duration_ticks = 0.0

    while pos < min(seg_end, len(data)):
        eid = _read_vint(data, pos)
        if eid is None:
            break
        pos += eid[1]
        sz = _read_vint(data, pos, strip_marker=True)
        if sz is None:
            break
        pos += sz[1]

        if eid[0] == 0x1549A966:  # Info
            end = pos + sz[0]
            ipos = pos
            while ipos < min(end, len(data)):
                sid = _read_vint(data, ipos)
                if sid is None:
                    break
                ipos += sid[1]
                ssz = _read_vint(data, ipos, strip_marker=True)
                if ssz is None:
                    break
                ipos += ssz[1]
                if sid[0] == 0x2AD7B1 and 1 <= ssz[0] <= 8:
                    timestamp_scale = int.from_bytes(data[ipos:ipos + ssz[0]], "big")
                elif sid[0] == 0x4489 and ssz[0] in (4, 8):
                    fmt = ">f" if ssz[0] == 4 else ">d"
                    (duration_ticks,) = struct.unpack(fmt, data[ipos:ipos + ssz[0]])
                ipos += ssz[0]
            pos = end
        else:
            pos += sz[0]

    if duration_ticks <= 0 or timestamp_scale <= 0:
        return 0.0
    return duration_ticks * timestamp_scale / 1_000_000_000


def _read_vint(data: bytes, pos: int, strip_marker: bool = False):
    if pos >= len(data):
        return None
    first = data[pos]
    if first == 0:
        return None
    length = 1
    mask = 0x80
    while not (first & mask):
        length += 1
        mask >>= 1
        if length > 8:
            return None
    if pos + length > len(data):
        return None
    value = (first & (mask - 1)) if strip_marker else first
    for i in range(1, length):
        value = (value << 8) | data[pos + i]
    return value, length
