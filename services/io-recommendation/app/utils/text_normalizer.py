"""
Text normalisation utilities.

Converts FIR/complaint domain objects into structured natural-language text
that is semantically rich for embedding. IDs, ObjectIds, and other
machine identifiers are NEVER included in the embedded text.
"""
from typing import List, Optional


def build_fir_text(
    crime_category: str,
    crime_sub_category: Optional[str],
    location: str,
    incident_summary: str,
    modus_operandi: Optional[str],
    evidence_summary: Optional[str],
    investigation_summary: Optional[str],
    sections: Optional[List[str]],
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

    # Geography
    parts.append(f"Location: {location}")

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
