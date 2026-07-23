"""
CaseContextBuilder implementation.
Combines complaint details and all processed evidence text into a unified CaseContext.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from app.case_understanding.interfaces import ICaseContextBuilder
from app.schemas.case_context import CaseContext, EvidenceItem


class CaseContextBuilder(ICaseContextBuilder):
    """Constructs unified CaseContext objects without performing AI analysis."""

    def build(
        self,
        complaint_text: str,
        evidence_items: List[EvidenceItem],
        case_id: Optional[str] = None,
        complaint_metadata: Optional[Dict[str, Any]] = None,
    ) -> CaseContext:
        return CaseContext(
            case_id=case_id or str(uuid.uuid4()),
            complaint_text=complaint_text.strip(),
            complaint_metadata=complaint_metadata or {},
            evidence=evidence_items,
        )
