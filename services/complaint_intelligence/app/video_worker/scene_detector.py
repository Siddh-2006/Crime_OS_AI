"""
Video Worker — scene detector implementations (M7).

PySceneDetector:
  - Uses PySceneDetect ContentDetector (frame-difference based, no ML).
  - Threshold configurable via settings.VIDEO_SCENE_THRESHOLD (default 27.0).
  - Falls back to a single scene covering the full video if no cuts are found.

MockSceneDetector:
  - Deterministic in-memory implementation for unit tests.
  - Returns a configurable list of SceneInfo without touching any video file.
"""
from __future__ import annotations

from app.core.logging import logger
from app.schemas.evidence import SceneInfo
from app.video_worker.interfaces import ISceneDetector


class PySceneDetector(ISceneDetector):
    """
    Production scene detector backed by PySceneDetect ContentDetector.

    Works entirely at the filesystem level (video_path → list[SceneInfo]).
    Does not perform any AI inference.
    """

    def __init__(self, threshold: float = 27.0) -> None:
        self._threshold = threshold

    def detect(self, video_path: str) -> list[SceneInfo]:
        from scenedetect import open_video, SceneManager  # type: ignore[import-untyped]
        from scenedetect.detectors import ContentDetector  # type: ignore[import-untyped]

        logger.info(
            "Scene detection started",
            extra={"video_path": video_path, "threshold": self._threshold},
        )

        try:
            video = open_video(video_path)
            total_duration_s: float = video.duration.get_seconds() if video.duration else 0.0

            manager = SceneManager()
            manager.add_detector(ContentDetector(threshold=self._threshold))
            manager.detect_scenes(video=video)
            raw_scenes = manager.get_scene_list()
        except Exception as exc:
            raise ValueError(f"PySceneDetect failed to process '{video_path}': {exc}") from exc

        if not raw_scenes:
            # Fallback: treat the whole video as one scene
            logger.info(
                "No scene cuts detected — treating full video as one scene",
                extra={"video_path": video_path},
            )
            return [SceneInfo(scene_index=0, start_time_s=0.0, end_time_s=total_duration_s)]

        scenes: list[SceneInfo] = []
        for i, (start_tc, end_tc) in enumerate(raw_scenes):
            scenes.append(
                SceneInfo(
                    scene_index=i,
                    start_time_s=start_tc.get_seconds(),
                    end_time_s=end_tc.get_seconds(),
                )
            )

        logger.info(
            "Scene detection completed",
            extra={"video_path": video_path, "num_scenes": len(scenes)},
        )
        return scenes


class MockSceneDetector(ISceneDetector):
    """
    Deterministic scene detector for unit tests.
    Returns a fixed list of SceneInfo without reading any video file.
    """

    def __init__(self, scenes: list[SceneInfo] | None = None) -> None:
        self._scenes = scenes or [
            SceneInfo(scene_index=0, start_time_s=0.0, end_time_s=5.0),
            SceneInfo(scene_index=1, start_time_s=5.0, end_time_s=10.0),
        ]

    def detect(self, video_path: str) -> list[SceneInfo]:
        return self._scenes
