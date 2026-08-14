"""
Text normalisation utilities.

Converts FIR/complaint domain objects into structured natural-language text
that is semantically rich for embedding. IDs, ObjectIds, and other
machine identifiers are NEVER included in the embedded text.
"""
from typing import List, Optional

from app.schemas.fir import (
    AnalysisSnapshotData,
    ArrestWarrantData,
    CaseChecklistItem,
    CaseEntityData,
    CaseParticipantData,
    ChargeSheetEntry,
    ComplaintIntelligenceData,
    DepartmentRequestData,
    DiaryEntryData,
)


def build_fir_text(
    crime_category: str,
    crime_sub_category: Optional[str],
    location: str,
    incident_summary: str,
    modus_operandi: Optional[str],
    evidence_summary: Optional[str],
    investigation_summary: Optional[str],
    sections: Optional[List[str]],
    created_at: Optional[str] = None,
    closed_date: Optional[str] = None,
    complaint_intelligence: Optional[ComplaintIntelligenceData] = None,
    diary_entries: Optional[List[DiaryEntryData]] = None,
    case_checklist: Optional[List[CaseChecklistItem]] = None,
    case_entities: Optional[List[CaseEntityData]] = None,
    analysis_snapshots: Optional[List[AnalysisSnapshotData]] = None,
    department_requests: Optional[List[DepartmentRequestData]] = None,
    charge_sheet: Optional[List[ChargeSheetEntry]] = None,
    participants: Optional[List[CaseParticipantData]] = None,
    arrest_warrants: Optional[List[ArrestWarrantData]] = None,
) -> str:
    """
    Converts a closed FIR's semantic fields into a structured block of text
    suitable for embedding with nomic-embed-text-v2-moe.

    The text format is deliberately verbose so that the model captures
    all relevant semantic dimensions of the case.
    """
    parts: List[str] = []

    # Core classification
    parts.append(f"Crime Category: {crime_category}")
    if crime_sub_category:
        parts.append(f"Sub Category: {crime_sub_category}")

    # Geography and timeline
    parts.append(f"Location: {location}")
    if created_at:
        parts.append(f"Created At: {created_at}")
    if closed_date:
        parts.append(f"Closed At: {closed_date}")

    # Core narrative
    parts.append(f"Incident Summary: {incident_summary}")

    # Modus operandi
    if modus_operandi:
        parts.append(f"Modus Operandi: {modus_operandi}")

    # Evidence collected
    if evidence_summary:
        parts.append(f"Evidence Summary: {evidence_summary}")

    # Investigation outcome
    if investigation_summary:
        parts.append(f"Investigation Summary: {investigation_summary}")

    # Legal sections
    if sections:
        parts.append(f"Sections Applied: {', '.join(sections)}")

    # Complaint intelligence
    if complaint_intelligence is not None:
        if complaint_intelligence.crimeType:
            parts.append(f"AI Crime Type: {complaint_intelligence.crimeType}")
        if complaint_intelligence.priority:
            parts.append(f"AI Priority: {complaint_intelligence.priority}")
        if complaint_intelligence.confidence is not None:
            parts.append(f"AI Confidence: {complaint_intelligence.confidence}")
        if complaint_intelligence.summary:
            parts.append(f"AI Complaint Summary: {complaint_intelligence.summary}")
        if complaint_intelligence.missingInformation:
            parts.append(
                "Missing Information: "
                + ", ".join(complaint_intelligence.missingInformation)
            )
        if complaint_intelligence.recommendations:
            parts.append(
                "AI Recommendations: "
                + ", ".join(complaint_intelligence.recommendations)
            )

    # Case checklist
    if case_checklist:
        parts.append("Case Checklist:")
        for item in case_checklist:
            checklist_parts: List[str] = []
            if item.title:
                checklist_parts.append(f"Title: {item.title}")
            if item.status:
                checklist_parts.append(f"Status: {item.status}")
            if item.criticality:
                checklist_parts.append(f"Criticality: {item.criticality}")
            if item.requiredEvidence:
                checklist_parts.append(
                    f"Required Evidence: {', '.join(item.requiredEvidence)}"
                )
            if item.proofEvidenceIds:
                checklist_parts.append(
                    f"Proof Evidence IDs: {', '.join(item.proofEvidenceIds)}"
                )
            if checklist_parts:
                parts.append("; ".join(checklist_parts))

    # Case entities
    if case_entities:
        parts.append("Case Entities:")
        for entity in case_entities:
            entity_parts: List[str] = []
            if entity.entityType:
                entity_parts.append(f"Type: {entity.entityType}")
            if entity.value:
                entity_parts.append(f"Value: {entity.value}")
            if entity.firstSeenEntryId:
                entity_parts.append(f"First Seen In: {entity.firstSeenEntryId}")
            if entity.corroboratingEvidenceIds:
                entity_parts.append(
                    f"Corroborating Evidence: {', '.join(entity.corroboratingEvidenceIds)}"
                )
            if entity_parts:
                parts.append("; ".join(entity_parts))

    # Investigation snapshot history
    if analysis_snapshots:
        parts.append("Analysis Snapshots:")
        for snapshot in analysis_snapshots:
            snapshot_parts: List[str] = []
            if snapshot.timestamp:
                snapshot_parts.append(f"Timestamp: {snapshot.timestamp}")
            if snapshot.trigger:
                snapshot_parts.append(f"Trigger: {snapshot.trigger}")
            if snapshot.narrativeSummary:
                snapshot_parts.append(f"Summary: {snapshot.narrativeSummary}")
            if snapshot.confidenceBreakdown:
                snapshot_parts.append(
                    f"Confidence Breakdown: {snapshot.confidenceBreakdown}"
                )
            if snapshot.officerAuthored is not None:
                snapshot_parts.append(
                    f"Officer Authored: {snapshot.officerAuthored}"
                )
            if snapshot.rankedNextSteps:
                snapshot_parts.append(
                    f"Ranked Next Steps: {snapshot.rankedNextSteps}"
                )
            if snapshot_parts:
                parts.append("; ".join(snapshot_parts))

    # Department requests
    if department_requests:
        parts.append("Department Requests:")
        for request in department_requests:
            request_parts: List[str] = []
            if request.stepId:
                request_parts.append(f"Checklist Step: {request.stepId}")
            if request.departmentEntityId:
                request_parts.append(f"Department Entity: {request.departmentEntityId}")
            if request.status:
                request_parts.append(f"Status: {request.status}")
            if request.draftContent:
                request_parts.append(f"Draft Content: {request.draftContent}")
            if request.sentVia:
                request_parts.append(f"Sent Via: {request.sentVia}")
            if request.sentAt:
                request_parts.append(f"Sent At: {request.sentAt}")
            if request.responseAt:
                request_parts.append(f"Response At: {request.responseAt}")
            if request_parts:
                parts.append("; ".join(request_parts))

    # Chargesheet
    if charge_sheet:
        parts.append("Chargesheet Entries:")
        for charge in charge_sheet:
            charge_parts: List[str] = []
            if charge.section:
                charge_parts.append(f"Section: {charge.section}")
            if charge.offense:
                charge_parts.append(f"Offense: {charge.offense}")
            if charge.count is not None:
                charge_parts.append(f"Count: {charge.count}")
            if charge_parts:
                parts.append("; ".join(charge_parts))

    # Diary history
    if diary_entries:
        parts.append("Diary Entries:")
        for entry in diary_entries:
            diary_parts: List[str] = []
            if entry.timestamp:
                diary_parts.append(f"Timestamp: {entry.timestamp}")
            if entry.actorType:
                diary_parts.append(f"Actor Type: {entry.actorType}")
            if entry.eventType:
                diary_parts.append(f"Event Type: {entry.eventType}")
            if entry.summary:
                diary_parts.append(f"Summary: {entry.summary}")
            if diary_parts:
                parts.append("; ".join(diary_parts))

    # Suspects and accused with applied legal sections
    if participants:
        parts.append("Case Participants:")
        for p in participants:
            p_parts: List[str] = []
            if p.name:
                p_parts.append(f"Name: {p.name}")
            if p.roles:
                p_parts.append(f"Roles: {', '.join(p.roles)}")
            if p.appliedSections:
                p_parts.append(f"Applied Sections: {', '.join(p.appliedSections)}")
            if p.statementSummary:
                p_parts.append(f"Statement: {p.statementSummary}")
            if p_parts:
                parts.append("; ".join(p_parts))

    # Arrest warrant outcomes (custody lifecycle)
    if arrest_warrants:
        parts.append("Arrest Warrants:")
        for w in arrest_warrants:
            w_parts: List[str] = []
            if w.accusedName:
                w_parts.append(f"Accused: {w.accusedName}")
            if w.status:
                w_parts.append(f"Warrant Status: {w.status}")
            if w.magistrateApprovalStatus:
                w_parts.append(f"Magistrate Decision: {w.magistrateApprovalStatus}")
            if w.appliedSections:
                w_parts.append(f"Charged Under: {', '.join(w.appliedSections)}")
            if w.arrestedAt:
                w_parts.append(f"Arrested At: {w.arrestedAt}")
            if w.producedBeforeCourtAt:
                w_parts.append(f"Produced Before Court: {w.producedBeforeCourtAt}")
            if w_parts:
                parts.append("; ".join(w_parts))

    return "\n".join(parts)


def build_complaint_text(
    category: str,
    sub_category: Optional[str],
    location: str,
    short_description: str,
    detailed_description: str,
    incident_date: str,
    evidence_summary: Optional[str],
    incident_time: Optional[str] = None,
    address: Optional[str] = None,
    approximate_date_text: Optional[str] = None,
    complaint_intelligence_summary: Optional[str] = None,
    crime_summary: Optional[str] = None,
    legal_sections: Optional[str] = None,
    investigation_notes: Optional[str] = None,
) -> str:
    """
    Converts an open (not-yet-closed) complaint into structured text
    for similarity search against the closed-FIR vector store.
    """
    parts: List[str] = []

    parts.append(f"Crime Category: {category}")
    if sub_category:
        parts.append(f"Sub Category: {sub_category}")

    parts.append(f"Location: {location}")
    parts.append(f"Incident Date: {incident_date}")
    if incident_time:
        parts.append(f"Incident Time: {incident_time}")
    if address:
        parts.append(f"Address: {address}")
    if approximate_date_text:
        parts.append(f"Approximate Date: {approximate_date_text}")
    parts.append(f"Brief Description: {short_description}")
    parts.append(f"Detailed Description: {detailed_description}")

    if complaint_intelligence_summary:
        parts.append(f"AI Summary: {complaint_intelligence_summary}")
    if crime_summary:
        parts.append(f"Investigation Summary: {crime_summary}")
    if legal_sections:
        parts.append(f"Legal Sections: {legal_sections}")
    if investigation_notes:
        parts.append(f"Investigation Notes: {investigation_notes}")
    if evidence_summary:
        parts.append(f"Evidence Available: {evidence_summary}")

    return "\n".join(parts)
