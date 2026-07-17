"""
Pydantic v2 schemas for AI recommendation responses.
"""
from pydantic import BaseModel, Field
from typing import List


class OfficerRecommendation(BaseModel):
    """
    AI-generated recommendation for a single Investigation Officer.
    The Node backend enriches this with officer name/badge from MongoDB.
    """

    officerId: str = Field(..., description="MongoDB ObjectId of the recommended officer")
    score: float = Field(..., ge=0.0, le=100.0, description="Normalised recommendation score (0–100)")
    matchedCases: int = Field(..., description="Number of semantically similar closed cases handled")
    averageSimilarity: float = Field(
        ..., ge=0.0, le=1.0,
        description="Average cosine similarity across matched cases",
    )
    reasons: List[str] = Field(..., description="Human-readable explanation of why this officer was recommended")


class RecommendOfficersResponse(BaseModel):
    """Full response from /recommend-officers."""

    recommendations: List[OfficerRecommendation]
    totalCasesSearched: int = Field(..., description="Total vectors queried in Qdrant")
    queryCategory: str = Field(..., description="Primary crime category of the current complaint")
