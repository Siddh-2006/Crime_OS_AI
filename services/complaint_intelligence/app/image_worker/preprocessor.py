"""
PILImagePreprocessor — deterministic image preprocessing using Pillow.

Steps:
  1. Correct EXIF orientation (tag 274) so Florence sees the right side up.
  2. Convert RGBA / palette / grayscale → RGB (Florence expects RGB JPEG).
  3. Resize to FLORENCE_MAX_IMAGE_DIM on longest edge (LANCZOS, aspect-preserving).
  4. Encode as JPEG (quality=90).

No AI is used. Fully deterministic, fully testable.
"""
from __future__ import annotations

import io

from PIL import Image, ImageOps

from app.core.config import settings
from app.image_worker.interfaces import IImagePreprocessor


class PILImagePreprocessor(IImagePreprocessor):
    """
    Prepares an image for Florence-2 inference.
    Never loads the original file again — works only with bytes.
    """

    def __init__(self, max_dim: int | None = None) -> None:
        self._max_dim = max_dim or settings.FLORENCE_MAX_IMAGE_DIM

    def preprocess(self, image_bytes: bytes) -> bytes:
        img = Image.open(io.BytesIO(image_bytes))

        # Step 1: EXIF orientation correction
        img = ImageOps.exif_transpose(img)

        # Step 2: Convert to RGB (handles RGBA, LA, P, L, etc.)
        if img.mode != "RGB":
            img = img.convert("RGB")

        # Step 3: Resize if needed (preserve aspect ratio)
        max_side = max(img.size)
        if max_side > self._max_dim:
            scale = self._max_dim / max_side
            new_w = int(img.width * scale)
            new_h = int(img.height * scale)
            img = img.resize((new_w, new_h), Image.LANCZOS)

        # Step 4: Encode as JPEG
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90, optimize=True)
        return buf.getvalue()
