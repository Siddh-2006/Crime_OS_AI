"""
Video Worker — keyframe extractor implementations (M7).

OpenCVKeyframeExtractor:
  - Uses cv2.VideoCapture to seek to frame positions within each scene.
  - Extracts start / middle / end frames (configurable via frames_per_scene).
  - Encodes frames as JPEG bytes — no AI, no preprocessing.
  - If frames_per_scene == 1, only the middle frame is extracted.
  - If frames_per_scene == 3, start / middle / end frames are extracted.

MockKeyframeExtractor:
  - Returns a configurable list of ExtractedKeyframe without touching any video file.
  - Uses a minimal 1x1 white JPEG as the placeholder frame_bytes.
"""
from __future__ import annotations

import struct

from app.core.logging import logger
from app.schemas.evidence import SceneInfo
from app.video_worker.interfaces import (
    ExtractedKeyframe,
    FramePosition,
    IKeyframeExtractor,
)


def _make_placeholder_jpeg() -> bytes:
    """Generate a minimal 1×1 white JPEG that PIL can actually decode."""
    import io as _io
    from PIL import Image  # Pillow is always present
    img = Image.new("RGB", (4, 4), color=(255, 255, 255))
    buf = _io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# Cached at import time — valid JPEG readable by PIL and cv2.
_PLACEHOLDER_JPEG: bytes = _make_placeholder_jpeg()


def _positions_for_scene(
    scene: SceneInfo,
    fps: float,
    frames_per_scene: int,
) -> list[tuple[FramePosition, float, int]]:
    """
    Compute (position, timestamp_s, frame_number) for each keyframe in a scene.

    frames_per_scene=1 → middle only
    frames_per_scene=3 → start, middle, end
    """
    total_frames = max(1, int(scene.duration_s * fps))
    start_frame = int(scene.start_time_s * fps)

    if frames_per_scene == 1:
        mid_frame = start_frame + total_frames // 2
        mid_ts = mid_frame / fps if fps > 0 else scene.midpoint_s
        return [(FramePosition.MIDDLE, mid_ts, mid_frame)]

    # 3-frame mode: start / middle / end
    start_fn = start_frame
    mid_fn = start_frame + total_frames // 2
    end_fn = start_frame + max(0, total_frames - 1)

    return [
        (FramePosition.START, start_fn / fps if fps > 0 else scene.start_time_s, start_fn),
        (FramePosition.MIDDLE, mid_fn / fps if fps > 0 else scene.midpoint_s, mid_fn),
        (FramePosition.END, end_fn / fps if fps > 0 else scene.end_time_s, end_fn),
    ]


class OpenCVKeyframeExtractor(IKeyframeExtractor):
    """
    Extracts keyframes from a video file using OpenCV VideoCapture.

    Pure deterministic — no AI, no captioning. Returns raw JPEG bytes.
    VideoWorker passes these bytes directly to ImageWorker.
    """

    def extract(
        self,
        video_path: str,
        scenes: list[SceneInfo],
        frames_per_scene: int = 3,
    ) -> list[ExtractedKeyframe]:
        import cv2  # type: ignore[import-untyped]

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"OpenCV could not open video: '{video_path}'")

        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        results: list[ExtractedKeyframe] = []

        logger.info(
            "Keyframe extraction started",
            extra={"video_path": video_path, "num_scenes": len(scenes), "fps": fps},
        )

        try:
            for scene in scenes:
                positions = _positions_for_scene(scene, fps, frames_per_scene)
                for pos, ts, frame_num in positions:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, float(frame_num))
                    ret, frame = cap.read()

                    if not ret or frame is None:
                        logger.warning(
                            "Frame seek failed — using placeholder",
                            extra={"scene_index": scene.scene_index, "frame_num": frame_num},
                        )
                        jpeg_bytes = _PLACEHOLDER_JPEG
                    else:
                        ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                        jpeg_bytes = bytes(buf.tobytes()) if ok else _PLACEHOLDER_JPEG

                    results.append(
                        ExtractedKeyframe(
                            scene=scene,
                            frame_position=pos,
                            timestamp_s=ts,
                            frame_bytes=jpeg_bytes,
                        )
                    )
        finally:
            cap.release()

        logger.info(
            "Keyframe extraction completed",
            extra={"total_keyframes": len(results)},
        )
        return results


class MockKeyframeExtractor(IKeyframeExtractor):
    """
    Deterministic keyframe extractor for unit tests.
    Returns fixed ExtractedKeyframe objects without touching any video file.
    """

    def __init__(self, frame_bytes: bytes | None = None) -> None:
        self._frame_bytes = frame_bytes or _PLACEHOLDER_JPEG

    def extract(
        self,
        video_path: str,
        scenes: list[SceneInfo],
        frames_per_scene: int = 3,
    ) -> list[ExtractedKeyframe]:
        results: list[ExtractedKeyframe] = []
        positions = (
            [FramePosition.MIDDLE]
            if frames_per_scene == 1
            else [FramePosition.START, FramePosition.MIDDLE, FramePosition.END]
        )
        for scene in scenes:
            for pos in positions:
                ts = (
                    scene.midpoint_s
                    if pos == FramePosition.MIDDLE
                    else (scene.start_time_s if pos == FramePosition.START else scene.end_time_s)
                )
                results.append(
                    ExtractedKeyframe(
                        scene=scene,
                        frame_position=pos,
                        timestamp_s=ts,
                        frame_bytes=self._frame_bytes,
                    )
                )
        return results
