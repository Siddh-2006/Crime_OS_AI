"""
Video Worker interfaces — M7.

Every concrete implementation must satisfy these contracts.
Business logic depends ONLY on these interfaces, never on concrete classes
(OpenCV, PySceneDetect, moviepy, mutagen, etc.).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum

from app.schemas.evidence import SceneInfo, VideoMetadata


class FramePosition(str, Enum):
    """Position of a keyframe within its scene."""
    START = "start"
    MIDDLE = "middle"
    END = "end"


@dataclass(frozen=True)
class ExtractedKeyframe:
    """
    A single keyframe extracted from a scene.

    Produced by IKeyframeExtractor, consumed by VideoWorker.
    VideoWorker passes frame_bytes to ImageWorker without any modification.
    """
    scene: SceneInfo
    frame_position: FramePosition
    timestamp_s: float
    frame_bytes: bytes          # JPEG-encoded frame


class ISceneDetector(ABC):
    """
    Detects scene boundaries in a video file.

    Responsibilities:
      - Read video from a file path
      - Run ContentDetector (frame-difference based, no ML)
      - Return list[SceneInfo] sorted chronologically
      - Fall back to a single scene if no cuts are detected
    """

    @abstractmethod
    def detect(self, video_path: str) -> list[SceneInfo]:
        """
        Detect scenes in a video file.

        Args:
            video_path: Absolute path to the video file on disk.

        Returns:
            List of SceneInfo, at minimum one entry (full video as one scene).

        Raises:
            ValueError: If the video file cannot be opened or parsed.
        """
        ...


class IKeyframeExtractor(ABC):
    """
    Extracts representative keyframes from detected scenes.

    Responsibilities:
      - Seek to the correct frame positions (start/middle/end of each scene)
      - Return JPEG-encoded bytes per frame
      - Never apply any AI/captioning — raw frame bytes only
    """

    @abstractmethod
    def extract(
        self,
        video_path: str,
        scenes: list[SceneInfo],
        frames_per_scene: int = 3,
    ) -> list[ExtractedKeyframe]:
        """
        Extract keyframes from scenes.

        Args:
            video_path:      Absolute path to the video file on disk.
            scenes:          Scene boundaries from ISceneDetector.
            frames_per_scene: 1 (middle only) or 3 (start/middle/end).

        Returns:
            List of ExtractedKeyframe, one per (scene, position) pair.
            Order: all frames for scene 0, then scene 1, etc.

        Raises:
            ValueError: If the video file cannot be read or a frame seek fails.
        """
        ...


class IAudioExtractor(ABC):
    """
    Extracts the audio track from a video file as WAV bytes.

    Responsibilities:
      - Detect whether an audio track exists
      - Convert audio to 16 kHz mono WAV (Whisper-ready)
      - Return None gracefully if no audio track exists
    """

    @abstractmethod
    def extract(self, video_path: str) -> bytes | None:
        """
        Extract the audio track from a video file.

        Args:
            video_path: Absolute path to the video file on disk.

        Returns:
            Raw WAV bytes (16 kHz mono PCM) if an audio track exists,
            None if the video is silent or has no audio stream.

        Raises:
            RuntimeError: If extraction fails for a transient reason.
        """
        ...


class IVideoMetadataExtractor(ABC):
    """
    Extracts deterministic video metadata without AI.

    Responsibilities:
      - Read video headers (duration, fps, resolution, frame count, codec)
      - Detect presence of audio track
      - Derive MIME type from file extension
    """

    @abstractmethod
    def extract(
        self,
        video_path: str,
        file_name: str,
        file_size_bytes: int,
    ) -> VideoMetadata:
        """
        Extract video metadata.

        Args:
            video_path:      Absolute path to the video file on disk.
            file_name:       Original filename (used for MIME type hint).
            file_size_bytes: Original file size in bytes.

        Returns:
            VideoMetadata populated from video headers.

        Raises:
            ValueError: If the file cannot be opened as a video.
        """
        ...
