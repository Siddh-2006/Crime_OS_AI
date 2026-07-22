"""
Shared image test utilities.

Provides synthetic image byte generators using Pillow
so tests have zero external file dependencies.
"""
from __future__ import annotations

import io
import struct

from PIL import Image


def make_jpeg_bytes(
    width: int = 64,
    height: int = 64,
    color: tuple[int, int, int] = (120, 60, 180),
) -> bytes:
    """Create a minimal valid JPEG image in memory."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def make_png_bytes(
    width: int = 64,
    height: int = 64,
    color: tuple[int, int, int] = (60, 120, 240),
) -> bytes:
    """Create a minimal valid PNG image in memory."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def make_rgba_png_bytes(width: int = 32, height: int = 32) -> bytes:
    """Create a valid RGBA PNG (needs RGB conversion before Florence)."""
    img = Image.new("RGBA", (width, height), (200, 100, 50, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def make_large_jpeg_bytes(dim: int = 2048) -> bytes:
    """Create a JPEG larger than FLORENCE_MAX_IMAGE_DIM to test resizing."""
    img = Image.new("RGB", (dim, dim), (80, 160, 240))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


CORRUPT_BYTES = b"\xff\xd8\xff\xe0CORRUPT_DATA_NOT_AN_IMAGE"
EMPTY_BYTES = b""
NOT_AN_IMAGE = b"this is just plain text, not an image"
