"""
Tests for PILMetadataExtractor.
"""
from __future__ import annotations

import pytest

from app.core.exceptions import InvalidImageError, UnsupportedFormatError
from app.image_worker.metadata_extractor import PILMetadataExtractor
from tests.image_test_utils import (
    CORRUPT_BYTES,
    EMPTY_BYTES,
    NOT_AN_IMAGE,
    make_jpeg_bytes,
    make_png_bytes,
    make_rgba_png_bytes,
)


@pytest.fixture
def extractor() -> PILMetadataExtractor:
    return PILMetadataExtractor()


def test_extracts_jpeg_metadata(extractor):
    data = make_jpeg_bytes(width=800, height=600)
    meta = extractor.extract(data, "photo.jpg", len(data))
    assert meta.format == "JPEG"
    assert meta.width == 800
    assert meta.height == 600
    assert meta.color_mode == "RGB"
    assert meta.file_size_bytes == len(data)
    assert meta.mime_type == "image/jpeg"


def test_extracts_png_metadata(extractor):
    data = make_png_bytes(width=256, height=128)
    meta = extractor.extract(data, "image.png", len(data))
    assert meta.format == "PNG"
    assert meta.width == 256
    assert meta.height == 128
    assert meta.mime_type == "image/png"


def test_rgba_png_metadata(extractor):
    data = make_rgba_png_bytes(32, 32)
    meta = extractor.extract(data, "overlay.png", len(data))
    assert meta.format == "PNG"
    assert meta.color_mode == "RGBA"


def test_exif_fields_are_none_when_absent(extractor):
    """Synthetic images have no EXIF — optional fields should be None."""
    data = make_jpeg_bytes()
    meta = extractor.extract(data, "noexif.jpg", len(data))
    assert meta.exif_timestamp is None
    assert meta.gps_coordinates is None
    assert meta.camera_make is None
    assert meta.camera_model is None


def test_file_name_does_not_affect_extraction(extractor):
    """file_name is metadata only — does not change what is extracted."""
    data = make_jpeg_bytes(64, 64)
    meta1 = extractor.extract(data, "a.jpg", len(data))
    meta2 = extractor.extract(data, "b.jpeg", len(data))
    assert meta1.format == meta2.format
    assert meta1.width == meta2.width


def test_raises_invalid_image_on_empty_bytes(extractor):
    with pytest.raises(InvalidImageError):
        extractor.extract(EMPTY_BYTES, "empty.jpg", 0)


def test_raises_unsupported_format_on_non_image(extractor):
    with pytest.raises((InvalidImageError, UnsupportedFormatError)):
        extractor.extract(NOT_AN_IMAGE, "text.txt", len(NOT_AN_IMAGE))
