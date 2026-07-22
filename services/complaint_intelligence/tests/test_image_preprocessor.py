"""
Tests for PILImagePreprocessor.
"""
from __future__ import annotations

import io

import pytest
from PIL import Image

from app.image_worker.preprocessor import PILImagePreprocessor
from tests.image_test_utils import make_jpeg_bytes, make_large_jpeg_bytes, make_png_bytes, make_rgba_png_bytes


@pytest.fixture
def preprocessor() -> PILImagePreprocessor:
    return PILImagePreprocessor(max_dim=1024)


def _load_jpeg_size(jpeg_bytes: bytes) -> tuple[int, int]:
    img = Image.open(io.BytesIO(jpeg_bytes))
    return img.size


def test_output_is_valid_jpeg(preprocessor):
    data = make_jpeg_bytes(64, 64)
    result = preprocessor.preprocess(data)
    assert result[:2] == b"\xff\xd8"  # JPEG magic bytes
    img = Image.open(io.BytesIO(result))
    assert img.format == "JPEG"


def test_rgba_converted_to_rgb(preprocessor):
    """RGBA PNG must be converted to RGB for Florence."""
    data = make_rgba_png_bytes(32, 32)
    result = preprocessor.preprocess(data)
    img = Image.open(io.BytesIO(result))
    assert img.mode == "RGB"


def test_png_converted_to_jpeg(preprocessor):
    """PNG input should produce JPEG output."""
    data = make_png_bytes(128, 128)
    result = preprocessor.preprocess(data)
    img = Image.open(io.BytesIO(result))
    assert img.format == "JPEG"


def test_large_image_is_resized(preprocessor):
    """Images larger than max_dim should be resized, shorter side scaled proportionally."""
    data = make_large_jpeg_bytes(dim=2048)
    result = preprocessor.preprocess(data)
    w, h = _load_jpeg_size(result)
    assert max(w, h) <= 1024


def test_small_image_not_resized(preprocessor):
    """Images within max_dim should not be upscaled."""
    data = make_jpeg_bytes(100, 100)
    result = preprocessor.preprocess(data)
    w, h = _load_jpeg_size(result)
    assert w == 100
    assert h == 100
