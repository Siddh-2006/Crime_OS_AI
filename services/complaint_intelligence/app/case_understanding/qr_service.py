"""
QRCodeService — encapsulates all QR code generation logic.
Returns a base64-encoded PNG data URI suitable for embedding directly in HTML or email.

Depends only on `qrcode[pil]` (pure Python, no native extensions beyond Pillow).
"""
from __future__ import annotations

import base64
import io

from app.core.logging import logger


class QRCodeService:
    """
    Generates QR code PNGs for upload URLs.
    Encapsulated as a service to keep QR logic out of the orchestrator and routes.
    """

    def __init__(
        self,
        box_size: int = 10,
        border: int = 4,
        error_correction: str = "M",  # L, M, Q, H
    ) -> None:
        self._box_size = box_size
        self._border = border
        self._ec_map = {"L": 1, "M": 0, "Q": 3, "H": 2}  # qrcode constants
        self._error_correction = error_correction

    def generate_base64_png(self, url: str) -> str:
        """
        Generate a QR code PNG for `url` and return a base64 data URI string.

        Returns:
            str: "data:image/png;base64,<base64-encoded-png>"
        """
        try:
            import qrcode  # type: ignore[import-untyped]
            from qrcode.constants import (  # type: ignore[import-untyped]
                ERROR_CORRECT_H,
                ERROR_CORRECT_L,
                ERROR_CORRECT_M,
                ERROR_CORRECT_Q,
            )

            ec_const_map = {
                "L": ERROR_CORRECT_L,
                "M": ERROR_CORRECT_M,
                "Q": ERROR_CORRECT_Q,
                "H": ERROR_CORRECT_H,
            }
            ec = ec_const_map.get(self._error_correction.upper(), ERROR_CORRECT_M)

            qr = qrcode.QRCode(
                version=None,       # auto-select smallest version that fits
                error_correction=ec,
                box_size=self._box_size,
                border=self._border,
            )
            qr.add_data(url)
            qr.make(fit=True)

            img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            img.save(buf)
            buf.seek(0)

            b64 = base64.b64encode(buf.read()).decode("utf-8")
            data_uri = f"data:image/png;base64,{b64}"

            logger.debug(
                "[qr_service] Generated QR code",
                extra={"url_prefix": url[:50], "data_uri_length": len(data_uri)},
            )
            return data_uri

        except ImportError:
            logger.warning("[qr_service] qrcode[pil] not installed — returning empty QR placeholder")
            return "data:image/png;base64,"

        except Exception as exc:
            logger.error("[qr_service] QR generation failed", extra={"error": str(exc)})
            return "data:image/png;base64,"
