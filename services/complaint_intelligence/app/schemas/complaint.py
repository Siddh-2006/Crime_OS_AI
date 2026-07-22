"""
Pydantic schemas for complaint profiling.
Supports aliases to allow flexible parsing of both camelCase and snake_case representations.
"""
from __future__ import annotations

from pydantic import BaseModel, Field, ConfigDict, AliasChoices


class ComplaintProfile(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
    )

    crime_type: str = Field(
        validation_alias=AliasChoices("crime_type", "crimeType"),
        description="The classified type of crime (e.g. cyber_financial_fraud, missing_person).",
    )
    priority: str = Field(
        validation_alias=AliasChoices("priority"),
        description="The priority level of the complaint (low, medium, high, critical).",
    )
    summary: str = Field(
        validation_alias=AliasChoices("summary"),
        description="A concise summary of the complaint.",
    )
    missing_information: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("missing_information", "missingInformation"),
        description="Critical information missing from the complaint text.",
    )
    recommendations: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("recommendations"),
        description="Recommended next steps for the investigation.",
    )
    confidence: float = Field(
        validation_alias=AliasChoices("confidence"),
        description="Confidence score between 0.0 and 1.0.",
    )
