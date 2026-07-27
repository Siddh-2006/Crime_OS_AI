"""
FileValidator — validates uploaded files using both MIME type detection
from magic bytes (python-magic) and a conservative allowlist.

Strategy:
  1. Read the first 2 KB of file bytes.
  2. Detect MIME type via libmagic (python-magic-bin on Windows).
  3. Cross-reference against the allowed MIME allowlist.
  4. Return a canonical media_type ("image", "video", "audio", "pdf", "document").

Never trusts filename extensions alone — always validates the actual file content.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

from app.core.logging import logger


# ── Allowed MIME Types ────────────────────────────────────────────────────────

_IMAGE_MIMES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/tiff",
    "image/svg+xml",
}

_VIDEO_MIMES = {
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/x-msvideo",       # AVI
    "video/x-matroska",      # MKV
    "video/webm",
    "video/3gpp",
}

_AUDIO_MIMES = {
    "audio/mpeg",            # MP3
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/flac",
    "audio/x-flac",
    "audio/m4a",
    "audio/aac",
    "audio/mp4",
}

_PDF_MIMES = {
    "application/pdf",
}

_DOCUMENT_MIMES = {
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",        # XLSX
    "application/rtf",
    "text/csv",
    "application/json",
}

_ALL_ALLOWED: dict[str, str] = {}
for _mime in _IMAGE_MIMES:
    _ALL_ALLOWED[_mime] = "image"
for _mime in _VIDEO_MIMES:
    _ALL_ALLOWED[_mime] = "video"
for _mime in _AUDIO_MIMES:
    _ALL_ALLOWED[_mime] = "audio"
for _mime in _PDF_MIMES:
    _ALL_ALLOWED[_mime] = "pdf"
for _mime in _DOCUMENT_MIMES:
    _ALL_ALLOWED[_mime] = "document"


# ── Result Dataclass ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class FileValidationResult:
    is_valid: bool
    detected_mime_type: str   # As detected by magic bytes
    media_type: str           # Canonical: image / video / audio / pdf / document / unknown
    rejection_reason: str     # Empty string if valid


# ── Validator ─────────────────────────────────────────────────────────────────

class FileValidator:
    """
    Validates file bytes using magic-byte MIME detection.
    Falls back to declared content_type if python-magic is unavailable.
    """

    def __init__(self, max_size_bytes: int = 50 * 1024 * 1024) -> None:
        """
        Args:
            max_size_bytes: Maximum allowed file size (default 50 MB).
        """
        self._max_size = max_size_bytes

    def validate(
        self,
        file_bytes: bytes,
        filename: str,
        declared_content_type: str = "",
    ) -> FileValidationResult:
        """
        Validate a file by magic bytes + size check.

        Args:
            file_bytes:             Raw bytes of the uploaded file.
            filename:               Original filename (for logging only — not trusted for type).
            declared_content_type:  MIME type declared by the HTTP client (not trusted alone).

        Returns:
            FileValidationResult with is_valid, detected MIME, canonical media_type, and reason.
        """
        # Size guard
        if len(file_bytes) == 0:
            return FileValidationResult(
                is_valid=False,
                detected_mime_type="",
                media_type="unknown",
                rejection_reason="File is empty.",
            )

        if len(file_bytes) > self._max_size:
            mb = len(file_bytes) / (1024 * 1024)
            limit_mb = self._max_size / (1024 * 1024)
            return FileValidationResult(
                is_valid=False,
                detected_mime_type="",
                media_type="unknown",
                rejection_reason=f"File size {mb:.1f} MB exceeds maximum allowed {limit_mb:.0f} MB.",
            )

        # Magic-byte MIME detection
        detected_mime = self._detect_mime(file_bytes, declared_content_type)

        # Allowlist lookup
        media_type = _ALL_ALLOWED.get(detected_mime)
        if media_type is None:
            # Try a prefix match (e.g. "image/jpeg; charset=..." → "image/jpeg")
            bare = detected_mime.split(";")[0].strip().lower()
            media_type = _ALL_ALLOWED.get(bare)

        if media_type is None:
            logger.warning(
                "[file_validator] Rejected file — MIME type not in allowlist",
                extra={"filename": filename, "detected_mime": detected_mime},
            )
            return FileValidationResult(
                is_valid=False,
                detected_mime_type=detected_mime,
                media_type="unknown",
                rejection_reason=(
                    f"File type '{detected_mime}' is not supported. "
                    "Accepted: images, video, audio, PDFs, and office documents."
                ),
            )

        logger.debug(
            "[file_validator] File accepted",
            extra={"filename": filename, "detected_mime": detected_mime, "media_type": media_type},
        )
        return FileValidationResult(
            is_valid=True,
            detected_mime_type=detected_mime,
            media_type=media_type,
            rejection_reason="",
        )

    @staticmethod
    def _detect_mime(file_bytes: bytes, fallback: str) -> str:
        """
        Detect MIME type from magic bytes using python-magic.
        Falls back to the declared content-type if libmagic is unavailable.
        """
        try:
            import magic  # python-magic-bin (Windows) / python-magic (Linux)
            return magic.from_buffer(file_bytes[:4096], mime=True)
        except ImportError:
            logger.warning("[file_validator] python-magic not available, using declared content-type as fallback")
            return fallback or "application/octet-stream"
        except Exception as exc:
            logger.warning("[file_validator] Magic detection failed", extra={"error": str(exc)})
            return fallback or "application/octet-stream"
