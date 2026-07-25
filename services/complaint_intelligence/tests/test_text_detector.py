"""
Tests for MockTextDetector and FlorenceTextDetector (mocked httpx).
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.image_worker.text_detector import FlorenceTextDetector, MockTextDetector
from tests.image_test_utils import make_jpeg_bytes


@pytest.mark.asyncio
async def test_mock_text_detector_returns_false():
    detector = MockTextDetector(returns=False)
    result = await detector.detect(make_jpeg_bytes())
    assert result is False


@pytest.mark.asyncio
async def test_mock_text_detector_returns_true():
    detector = MockTextDetector(returns=True)
    result = await detector.detect(make_jpeg_bytes())
    assert result is True


@pytest.mark.asyncio
async def test_mock_text_detector_image_bytes_ignored():
    """MockTextDetector ignores image content — returns configured value."""
    detector = MockTextDetector(returns=True)
    assert await detector.detect(b"") is True
    assert await detector.detect(b"random bytes") is True


@pytest.mark.asyncio
async def test_florence_text_detector_returns_true_when_text_found():
    """FlorenceTextDetector returns True when Florence OCR response has text."""
    detector = FlorenceTextDetector(base_url="http://mock-florence", timeout=5)
    mock_response = MagicMock()
    mock_response.json.return_value = {"result": "This is a bank statement with lots of text"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await detector.detect(make_jpeg_bytes())
        assert result is True


@pytest.mark.asyncio
async def test_florence_text_detector_returns_false_when_empty_response():
    """FlorenceTextDetector returns False when Florence OCR result is empty/short."""
    detector = FlorenceTextDetector(base_url="http://mock-florence", timeout=5)
    mock_response = MagicMock()
    mock_response.json.return_value = {"result": ""}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = await detector.detect(make_jpeg_bytes())
        assert result is False
