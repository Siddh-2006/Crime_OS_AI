"""
Video Worker — metadata extractor implementations (M7).

OpenCVVideoMetadataExtractor:
  - Uses cv2.VideoCapture to read fps, frame count, width, height.
  - Uses mutagen to detect codec from video headers.
  - Detects audio track presence via mutagen (MP4/MKV) or fallback flag.
  - Never uses AI — entirely deterministic.

MockVideoMetadataExtractor:
  - Returns a fixed VideoMetadata for unit tests.
  - No file I/O, no cv2, no mutagen dependency in tests.
"""
from __future__ import annotations

import mimetypes

from app.core.logging import logger
from app.schemas.evidence import VideoMetadata
from app.video_worker.interfaces import IVideoMetadataExtractor


_EXT_TO_MIME: dict[str, str] = {
    ".mp4":  "video/mp4",
    ".mov":  "video/quicktime",
    ".avi":  "video/x-msvideo",
    ".webm": "video/webm",
    ".mkv":  "video/x-matroska",
    ".flv":  "video/x-flv",
    ".m4v":  "video/mp4",
}


def _mime_from_filename(file_name: str) -> str:
    ext = "." + file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if ext in _EXT_TO_MIME:
        return _EXT_TO_MIME[ext]
    guessed, _ = mimetypes.guess_type(file_name)
    return guessed or "video/octet-stream"


class OpenCVVideoMetadataExtractor(IVideoMetadataExtractor):
    """
    Extracts video metadata using OpenCV + mutagen.

    OpenCV provides: fps, frame_count, width, height, duration.
    mutagen provides: codec (from container tags), has_audio flag.
    """

    def extract(
        self,
        video_path: str,
        file_name: str,
        file_size_bytes: int,
    ) -> VideoMetadata:
        import cv2  # type: ignore[import-untyped]

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"OpenCV could not open video: '{video_path}'")

        try:
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            duration_seconds = frame_count / fps if fps > 0 else 0.0
        finally:
            cap.release()

        codec, has_audio = self._read_codec_and_audio(video_path)
        mime_type = _mime_from_filename(file_name)

        logger.debug(
            "Video metadata extracted",
            extra={
                "file_name": file_name,
                "fps": fps,
                "frame_count": frame_count,
                "resolution": f"{width}x{height}",
                "duration_seconds": duration_seconds,
                "codec": codec,
                "has_audio": has_audio,
            },
        )

        return VideoMetadata(
            duration_seconds=duration_seconds,
            fps=fps,
            width=width,
            height=height,
            frame_count=frame_count,
            codec=codec,
            has_audio=has_audio,
            file_size_bytes=file_size_bytes,
            mime_type=mime_type,
        )

    def _read_codec_and_audio(self, video_path: str) -> tuple[str | None, bool]:
        """Use mutagen to detect codec and audio track presence."""
        try:
            import mutagen  # type: ignore[import-untyped]
            import io as _io

            with open(video_path, "rb") as f:
                data = f.read()

            tag = mutagen.File(_io.BytesIO(data))
            if tag is None:
                return None, False

            info = tag.info
            codec_class = type(info).__name__.lower()

            # mutagen MP4Info has codec_description; for others use class name
            codec: str | None = None
            has_audio = False

            if hasattr(info, "codec"):
                codec = str(getattr(info, "codec", ""))
            elif hasattr(info, "codec_description"):
                codec = str(getattr(info, "codec_description", ""))
            else:
                codec = codec_class or None

            # Audio track detection: mutagen exposes channels for audio streams
            if hasattr(info, "channels") and getattr(info, "channels", 0):
                has_audio = True
            elif hasattr(tag, "tags") and tag.tags is not None:
                has_audio = True  # tags usually implies A/V content

            return codec, has_audio
        except Exception:
            return None, False


class MockVideoMetadataExtractor(IVideoMetadataExtractor):
    """
    Deterministic video metadata extractor for unit tests.
    Returns a fixed VideoMetadata without reading any file.
    """

    def __init__(self, result: VideoMetadata | None = None) -> None:
        self._result = result or VideoMetadata(
            duration_seconds=10.0,
            fps=25.0,
            width=1280,
            height=720,
            frame_count=250,
            codec="h264",
            has_audio=True,
            file_size_bytes=5_000_000,
            mime_type="video/mp4",
        )

    def extract(
        self,
        video_path: str,
        file_name: str,
        file_size_bytes: int,
    ) -> VideoMetadata:
        return self._result
