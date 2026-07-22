"""
PILMetadataExtractor — deterministic image metadata extraction using Pillow.

Extracts: format, dimensions, color mode, file size, MIME type,
          EXIF timestamp, GPS coordinates, camera make/model.

No AI is used. Pure Pillow — fully deterministic and testable.
"""
from __future__ import annotations

import io
from typing import Any

from PIL import Image, ExifTags, UnidentifiedImageError

from app.core.exceptions import InvalidImageError, UnsupportedFormatError
from app.image_worker.interfaces import IMetadataExtractor
from app.schemas.evidence import ImageMetadata

# Supported formats (PIL can open more, but we restrict to common investigation formats)
_SUPPORTED_FORMATS = frozenset({"JPEG", "PNG", "WEBP", "TIFF", "BMP", "GIF"})

# MIME type mapping
_MIME_MAP: dict[str, str] = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "TIFF": "image/tiff",
    "BMP": "image/bmp",
    "GIF": "image/gif",
}

# EXIF tag IDs
_EXIF_DATETIME_ORIGINAL = 36867   # DateTimeOriginal
_EXIF_MAKE = 271                  # Camera make
_EXIF_MODEL = 272                 # Camera model
_EXIF_GPS_INFO = 34853            # GPSInfo IFD pointer


def _rational_to_float(rational: Any) -> float:
    """Convert PIL IFDRational or (numerator, denominator) tuple to float."""
    try:
        if hasattr(rational, "numerator") and hasattr(rational, "denominator"):
            return rational.numerator / rational.denominator
        if isinstance(rational, tuple) and len(rational) == 2:
            return rational[0] / rational[1]
        return float(rational)
    except (ZeroDivisionError, TypeError):
        return 0.0


def _dms_to_decimal(dms: tuple, ref: str) -> float:
    """Convert degrees/minutes/seconds + reference to decimal degrees."""
    degrees = _rational_to_float(dms[0])
    minutes = _rational_to_float(dms[1])
    seconds = _rational_to_float(dms[2])
    decimal = degrees + minutes / 60 + seconds / 3600
    if ref in ("S", "W"):
        decimal = -decimal
    return round(decimal, 6)


def _extract_gps(gps_ifd: dict) -> dict[str, float] | None:
    """Parse GPS IFD sub-dictionary into lat/lon decimal degrees."""
    try:
        lat_dms = gps_ifd.get(2)
        lat_ref = gps_ifd.get(1, "N")
        lon_dms = gps_ifd.get(4)
        lon_ref = gps_ifd.get(3, "E")
        if lat_dms and lon_dms:
            return {
                "lat": _dms_to_decimal(lat_dms, lat_ref),
                "lon": _dms_to_decimal(lon_dms, lon_ref),
            }
    except Exception:
        pass
    return None


class PILMetadataExtractor(IMetadataExtractor):
    """
    Extracts image metadata using Pillow.
    Raises InvalidImageError for corrupt images.
    Raises UnsupportedFormatError for unsupported formats.
    """

    def extract(self, image_bytes: bytes, file_name: str, file_size_bytes: int) -> ImageMetadata:
        if not image_bytes:
            raise InvalidImageError("Image bytes are empty.")

        try:
            img = Image.open(io.BytesIO(image_bytes))
            img.verify()  # Raises if corrupt
            # Re-open after verify (verify() exhausts the stream)
            img = Image.open(io.BytesIO(image_bytes))
        except UnidentifiedImageError:
            raise UnsupportedFormatError(f"Cannot identify image format for '{file_name}'.")
        except Exception as exc:
            raise InvalidImageError(f"Image '{file_name}' is corrupt or unreadable: {exc}")

        fmt = img.format or "UNKNOWN"
        if fmt not in _SUPPORTED_FORMATS:
            raise UnsupportedFormatError(
                f"Format '{fmt}' is not supported. Supported: {', '.join(sorted(_SUPPORTED_FORMATS))}"
            )

        width, height = img.size
        color_mode = img.mode
        mime_type = _MIME_MAP.get(fmt, "application/octet-stream")

        # EXIF extraction
        exif_timestamp: str | None = None
        gps_coordinates: dict[str, float] | None = None
        camera_make: str | None = None
        camera_model: str | None = None

        try:
            raw_exif = img.getexif()
            if raw_exif:
                exif_timestamp = raw_exif.get(_EXIF_DATETIME_ORIGINAL)
                camera_make = raw_exif.get(_EXIF_MAKE)
                camera_model = raw_exif.get(_EXIF_MODEL)

                # GPS sub-IFD
                gps_ifd = raw_exif.get_ifd(_EXIF_GPS_INFO)
                if gps_ifd:
                    gps_coordinates = _extract_gps(dict(gps_ifd))
        except Exception:
            # EXIF is optional — never fail metadata extraction because of it
            pass

        return ImageMetadata(
            format=fmt,
            width=width,
            height=height,
            color_mode=color_mode,
            file_size_bytes=file_size_bytes,
            mime_type=mime_type,
            exif_timestamp=exif_timestamp,
            gps_coordinates=gps_coordinates,
            camera_make=camera_make,
            camera_model=camera_model,
        )
