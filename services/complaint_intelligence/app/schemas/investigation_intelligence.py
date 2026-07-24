"""
Pydantic schemas for Milestone 12 — Investigation Intelligence Engine.

Purpose: Intelligent Complaint Representation & Understanding.
This module transforms Complaint Profile, Evidence Profiles, and Timeline
Intelligence into a structured, semantically enriched representation that
enables police officers to quickly understand the complaint and investigation state.

It does NOT generate reports, action plans, or investigative recommendations.

CrimeClassification          — Structured factual crime classification.
KeyEntitySummary             — Correlated entity across complaint and evidence.
MissingEvidenceGap           — Identified missing evidence or investigative gap (no recommendations).
InvestigationRiskFactor      — Individual risk factor contributing to case risk score.
InvestigationRiskAssessment  — Overall risk score, risk level, and risk breakdown.
InvestigationIntelligenceInput — Input payload (ComplaintProfile + EvidenceProfiles + TimelineIntelligence).
InvestigationIntelligence      — Structured, semantically enriched output representation.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, AliasChoices

from app.schemas.complaint import ComplaintProfile
from app.schemas.evidence import EvidenceProfile
from app.schemas.timeline_intelligence import TimelineContradiction, TimelineIntelligence


class CrimeClassification(BaseModel):
    """Structured classification of the alleged/suspected crime based strictly on evidence."""
    model_config = ConfigDict(populate_by_name=True)

    primary_category: str = Field(
        validation_alias=AliasChoices("primary_category", "primaryCategory"),
        description="Primary crime classification category (e.g., cyber_fraud, extortion, assault).",
    )
    sub_category: str = Field(
        default="",
        validation_alias=AliasChoices("sub_category", "subCategory"),
        description="Specific sub-category of the crime (e.g., phishing, investment_scam).",
    )
    applicable_statutes: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("applicable_statutes", "applicableStatutes"),
        description="Applicable penal code or legal sections (e.g., IPC 420, IT Act 66D).",
    )
    rationale: str = Field(
        default="",
        description="Factual rationale for the crime classification — directly traceable to available evidence.",
    )


class KeyEntitySummary(BaseModel):
    """Entity correlated across complaint and evidence sources."""
    model_config = ConfigDict(populate_by_name=True)

    entity_type: str = Field(
        validation_alias=AliasChoices("entity_type", "entityType"),
        description="Type of entity (person, vehicle, account, location, phone, document).",
    )
    name_or_value: str = Field(
        validation_alias=AliasChoices("name_or_value", "nameOrValue"),
        description="Name, identifier, or value of the entity.",
    )
    role: str = Field(
        default="unknown",
        description="Role in the case (victim, suspect, witness, instrument, location, unknown).",
    )
    corroborating_sources: list[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("corroborating_sources", "corroboratingSources"),
        description="Evidence IDs or source references that mention or corroborate this entity.",
    )


class MissingEvidenceGap(BaseModel):
    """
    Identified missing evidence or investigative gap.

    Contains only factual gap description and impact — no recommendations
    or instructions on where/how to obtain evidence.
    """
    model_config = ConfigDict(populate_by_name=True)

    gap_id: str = Field(
        validation_alias=AliasChoices("gap_id", "gapId"),
    )
    description: str = Field(
        description="Factual description of the missing evidence or gap identified.",
    )
    impact: str = Field(
        default="",
        description="Factual impact of this gap on investigation understanding capability.",
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence that this is a genuine gap (0.0 = uncertain, 1.0 = certain).",
    )


class InvestigationRiskFactor(BaseModel):
    """Individual risk factor identified from available evidence."""
    model_config = ConfigDict(populate_by_name=True)

    factor_name: str = Field(
        validation_alias=AliasChoices("factor_name", "factorName"),
    )
    severity: Literal["low", "medium", "high", "critical"] = Field(
        default="medium",
    )
    description: str = Field(
        default="",
        description="Factual description of this risk factor based on evidence.",
    )


class InvestigationRiskAssessment(BaseModel):
    """
    Quantitative and qualitative risk assessment based on the available evidence.
    Reflects case complexity and investigation difficulty — not officer priorities.
    """
    model_config = ConfigDict(populate_by_name=True)

    score: float = Field(
        ge=0.0,
        le=10.0,
        description="Overall risk score on a scale of 0.0 (negligible) to 10.0 (critical).",
    )
    level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = Field(
        default="MEDIUM",
        description="Risk level tier derived from available evidence.",
    )
    factors: list[InvestigationRiskFactor] = Field(
        default_factory=list,
        description="Breakdown of identified risk factors.",
    )


class InvestigationIntelligenceInput(BaseModel):
    """Input payload for Investigation Intelligence analysis."""
    model_config = ConfigDict(populate_by_name=True)

    complaint_profile: ComplaintProfile = Field(
        validation_alias=AliasChoices("complaint_profile", "complaintProfile"),
    )
    evidence_profiles: list[EvidenceProfile] = Field(
        default_factory=list,
        validation_alias=AliasChoices("evidence_profiles", "evidenceProfiles"),
    )
    timeline_intelligence: TimelineIntelligence = Field(
        validation_alias=AliasChoices("timeline_intelligence", "timelineIntelligence"),
    )


class InvestigationIntelligence(BaseModel):
    """
    Structured, semantically enriched representation of the complaint and investigation state.

    Purpose: Enable police officers to quickly understand the complaint, the available
    evidence, identified contradictions, entity relationships, and investigation risk.

    This is NOT a report. It does NOT contain action plans, investigative decisions,
    officer recommendations, or executive summaries.
    """
    model_config = ConfigDict(populate_by_name=True)

    intelligence_id: str = Field(
        validation_alias=AliasChoices("intelligence_id", "intelligenceId"),
    )
    context_id: str = Field(
        default="",
        validation_alias=AliasChoices("context_id", "contextId"),
    )
    crime_classification: CrimeClassification = Field(
        validation_alias=AliasChoices("crime_classification", "crimeClassification"),
        description="Structured crime classification based on complaint and evidence.",
    )
    complaint_understanding: str = Field(
        validation_alias=AliasChoices("complaint_understanding", "complaintUnderstanding"),
        description=(
            "Structured semantic understanding of the complaint — what happened, "
            "who is involved, key facts corroborated across sources. "
            "Based strictly on provided inputs. No invented facts."
        ),
    )
    correlated_entities: list[KeyEntitySummary] = Field(
        default_factory=list,
        validation_alias=AliasChoices("correlated_entities", "correlatedEntities"),
        description="Key entities correlated across complaint, evidence, and timeline.",
    )
    contradictions: list[TimelineContradiction] = Field(
        default_factory=list,
        description="Contradictions detected across complaint, evidence, and timeline.",
    )
    investigative_gaps: list[MissingEvidenceGap] = Field(
        default_factory=list,
        validation_alias=AliasChoices("investigative_gaps", "investigativeGaps"),
        description="Missing evidence and factual gaps identified in the available data.",
    )
    risk_assessment: InvestigationRiskAssessment = Field(
        validation_alias=AliasChoices("risk_assessment", "riskAssessment"),
        description="Case risk assessment derived from the available evidence.",
    )
    confidence_score: float = Field(
        ge=0.0,
        le=1.0,
        default=0.8,
        validation_alias=AliasChoices("confidence_score", "confidenceScore"),
        description="Overall confidence score (0.0 to 1.0) in this intelligence based on evidence corroboration.",
    )
    confidence_rationale: str = Field(
        default="",
        validation_alias=AliasChoices("confidence_rationale", "confidenceRationale"),
        description="Factual rationale for the confidence score.",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        validation_alias=AliasChoices("created_at", "createdAt"),
    )
    processing_duration_ms: float = Field(
        default=0.0,
        validation_alias=AliasChoices("processing_duration_ms", "processingDurationMs"),
    )


class InvestigationContext(BaseModel):
    """Aggregated investigation state used throughout timeline and analysis stages."""
    model_config = ConfigDict(populate_by_name=True)

    context_id: str = Field(
        validation_alias=AliasChoices("context_id", "contextId"),
        description="Unique identifier for the fused investigation context.",
    )
    complaint_profile: ComplaintProfile = Field(
        validation_alias=AliasChoices("complaint_profile", "complaintProfile"),
    )
    evidence_profiles: list[EvidenceProfile] = Field(
        default_factory=list,
        validation_alias=AliasChoices("evidence_profiles", "evidenceProfiles"),
    )
    timeline_intelligence: TimelineIntelligence = Field(
        validation_alias=AliasChoices("timeline_intelligence", "timelineIntelligence"),
    )
    total_entities_fused: int = Field(
        default=0,
        validation_alias=AliasChoices("total_entities_fused", "totalEntitiesFused"),
    )
    total_events_fused: int = Field(
        default=0,
        validation_alias=AliasChoices("total_events_fused", "totalEventsFused"),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        validation_alias=AliasChoices("created_at", "createdAt"),
    )
    notes: str = Field(
        default="",
        description="Optional summary notes about the investigation context and fusion results.",
    )
