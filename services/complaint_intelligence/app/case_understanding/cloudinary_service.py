"""
CloudinaryService — handles uploading evidence files to Cloudinary.
Returns the permanent secure_url for storage in EvidenceProfile and EvidenceRecord.
"""
from __future__ import annotations

import asyncio
from typing import Optional

from app.core.config import settings
from app.core.logging import logger


class CloudinaryService:
    """Encapsulates file upload to Cloudinary using python-cloudinary."""

    def __init__(self) -> None:
        self.cloud_name = settings.CLOUDINARY_CLOUD_NAME
        self.api_key = settings.CLOUDINARY_API_KEY
        self.api_secret = settings.CLOUDINARY_API_SECRET
        self.folder = settings.CLOUDINARY_FOLDER
        self._configured = False

        if self.cloud_name and self.api_key and self.api_secret:
            try:
                import cloudinary
                cloudinary.config(
                    cloud_name=self.cloud_name,
                    api_key=self.api_key,
                    api_secret=self.api_secret,
                    secure=True,
                )
                self._configured = True
                logger.info(
                    "[cloudinary_service] Cloudinary SDK initialized successfully",
                    extra={"cloud": self.cloud_name},
                )
            except Exception as exc:
                logger.warning(
                    "[cloudinary_service] Failed to initialize Cloudinary SDK",
                    extra={"error": str(exc)},
                )

    async def upload_file(
        self,
        file_bytes: bytes,
        filename: str,
        media_type: str = "image",
        case_id: Optional[str] = None,
    ) -> Optional[str]:
        """
        Upload file_bytes to Cloudinary and return the secure_url string.
        Runs off the main thread via asyncio.to_thread.
        """
        if not self._configured:
            logger.warning(
                "[cloudinary_service] Cloudinary not configured — skipping cloud upload",
                extra={"file_name": filename},
            )
            return None

        def _sync_upload() -> Optional[str]:
            import cloudinary.uploader  # type: ignore[import-untyped]

            resource_type = "auto"
            if media_type in ("image", "png", "jpg", "jpeg", "webp"):
                resource_type = "image"
            elif media_type in ("video", "mp4", "mov", "avi", "mkv"):
                resource_type = "video"
            elif media_type in ("raw", "pdf", "document", "txt"):
                resource_type = "raw"

            folder_path = f"{self.folder}/{case_id}" if case_id else self.folder

            response = cloudinary.uploader.upload(
                file_bytes,
                folder=folder_path,
                resource_type=resource_type,
                use_filename=True,
                unique_filename=True,
            )
            url = response.get("secure_url") or response.get("url")
            logger.info(
                "[cloudinary_service] Uploaded evidence file to Cloudinary",
                extra={"file_name": filename, "url": url, "public_id": response.get("public_id")},
            )
            return url

        try:
            return await asyncio.to_thread(_sync_upload)
        except Exception as exc:
            logger.error(
                "[cloudinary_service] Cloudinary upload failed",
                extra={"file_name": filename, "error": str(exc)},
            )
            return None
