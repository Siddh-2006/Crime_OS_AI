"""
Tests for FlorenceCaptioner (mocked httpx) and MockImageCaptioner.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.core.exceptions import LLMError
from app.image_worker.captioner import (
    FlorenceCaptioner,
    MockImageCaptioner,
    _parse_caption,
)
from app.schemas.evidence import ImageAnalysisResult
from tests.image_test_utils import make_jpeg_bytes


def _mock_florence(result_text: str):
    """Build patched httpx.AsyncClient context that returns given result."""
    mock_response = MagicMock()
    mock_response.json.return_value = {"result": result_text}
    mock_response.raise_for_status = MagicMock()

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=mock_response)
    return mock_client


@pytest.mark.asyncio
async def test_mock_captioner_returns_configured_result():
    custom = ImageAnalysisResult(
        description="A test scene.",
        scene_type="indoor",
        tags=["table", "chair"],
        confidence=0.9,
        contains_people=True,
        contains_vehicles=False,
        contains_weapons=False,
        contains_buildings=False,
        contains_documents=False,
    )
    captioner = MockImageCaptioner(result=custom)
    result = await captioner.caption(make_jpeg_bytes())
    assert result.description == "A test scene."
    assert result.scene_type == "indoor"
    assert result.contains_people is True


@pytest.mark.asyncio
async def test_mock_captioner_default_result():
    captioner = MockImageCaptioner()
    result = await captioner.caption(make_jpeg_bytes())
    assert isinstance(result, ImageAnalysisResult)
    assert result.description != ""


def test_parse_caption_vehicle_scene():
    result = _parse_caption("A blue car parked near a building on a street.")
    assert result.contains_vehicles is True
    assert result.contains_buildings is True
    assert result.scene_type == "outdoor"


def test_parse_caption_document_scene():
    result = _parse_caption("A bank statement document with numbers and text.")
    assert result.contains_documents is True
    assert result.scene_type == "document"


def test_parse_caption_weapon_detected():
    result = _parse_caption("A man holding a gun in his hand.")
    assert result.contains_weapons is True
    assert result.contains_people is True


@pytest.mark.asyncio
async def test_florence_captioner_parses_response():
    captioner = FlorenceCaptioner(base_url="http://mock-florence", timeout=5)
    with patch("httpx.AsyncClient", return_value=_mock_florence("A police officer standing near a car.")):
        result = await captioner.caption(make_jpeg_bytes())
    assert isinstance(result, ImageAnalysisResult)
    assert result.contains_people is True
    assert result.contains_vehicles is True
    assert result.confidence == 0.85
