"""
MongoDB Repositories for ComplaintProfile and EvidenceProfile.
Enforces Repository Pattern & Single Responsibility Principle.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.core.logging import logger
from app.core.mongo import get_mongo_db
from app.schemas.case_profile import ComplaintProfile, EvidenceProfile


# ─── INTERFACES ───────────────────────────────────────────────────────────────

class IComplaintProfileRepository(ABC):
    @abstractmethod
    async def save(self, profile: ComplaintProfile) -> None:
        """Persist or update a ComplaintProfile."""
        ...

    @abstractmethod
    async def get_by_case_id(self, case_id: str) -> Optional[ComplaintProfile]:
        """Fetch ComplaintProfile by case_id."""
        ...


class IEvidenceProfileRepository(ABC):
    @abstractmethod
    async def save(self, profile: EvidenceProfile) -> None:
        """Persist or update an EvidenceProfile."""
        ...

    @abstractmethod
    async def get_by_evidence_id(self, evidence_id: str) -> Optional[EvidenceProfile]:
        """Fetch single EvidenceProfile by evidence_id (used for idempotency check)."""
        ...

    @abstractmethod
    async def get_all_for_case(self, case_id: str) -> List[EvidenceProfile]:
        """Fetch all EvidenceProfiles belonging to a case_id."""
        ...


# ─── MONGO IMPLEMENTATIONS ───────────────────────────────────────────────────

class MongoComplaintProfileRepository(IComplaintProfileRepository):
    def __init__(self, collection_name: str = "complaint_profiles", use_in_memory: bool = False) -> None:
        self.collection_name = collection_name
        self.use_in_memory = use_in_memory
        self._in_memory: dict[str, dict] = {}

    async def save(self, profile: ComplaintProfile) -> None:
        doc = profile.model_dump(mode="json")
        doc["_id"] = profile.case_id
        
        db = None if self.use_in_memory else await get_mongo_db()
        if db is not None:
            await db[self.collection_name].replace_one({"_id": profile.case_id}, doc, upsert=True)
            logger.info("[repository] Saved ComplaintProfile to MongoDB", extra={"case_id": profile.case_id})
        else:
            self._in_memory[profile.case_id] = doc
            logger.info("[repository] Saved ComplaintProfile in-memory", extra={"case_id": profile.case_id})

    async def get_by_case_id(self, case_id: str) -> Optional[ComplaintProfile]:
        db = None if self.use_in_memory else await get_mongo_db()
        if db is not None:
            doc = await db[self.collection_name].find_one({"$or": [{"_id": case_id}, {"case_id": case_id}]})
            if doc:
                doc.pop("_id", None)
                return ComplaintProfile.model_validate(doc)
            return None
        else:
            doc = self._in_memory.get(case_id)
            if doc:
                d = dict(doc)
                d.pop("_id", None)
                return ComplaintProfile.model_validate(d)
            return None


class MongoEvidenceProfileRepository(IEvidenceProfileRepository):
    def __init__(self, collection_name: str = "evidences", use_in_memory: bool = False) -> None:
        self.collection_name = collection_name
        self.use_in_memory = use_in_memory
        self._in_memory: dict[str, dict] = {}

    async def save(self, profile: EvidenceProfile) -> None:
        doc = profile.model_dump(mode="json")
        doc["_id"] = profile.evidence_id
        doc["evidence_id"] = profile.evidence_id
        doc["case_id"] = profile.case_id
        doc["originalFilename"] = profile.filename
        doc["type"] = profile.media_type
        doc["storage_ref"] = profile.url or ""
        doc["processingStatus"] = profile.processing_status

        # Build aiMetadata sub-document for Node.js compatibility
        ai_meta = doc.get("aiMetadata") or doc.get("ai_metadata") or {}
        if profile.ocr_text:
            ai_meta["ocrText"] = profile.ocr_text
        if profile.florence_description:
            ai_meta["aiSummary"] = profile.florence_description
        if profile.transcript:
            ai_meta["speechTranscript"] = profile.transcript
        if profile.pdf_text:
            ai_meta["pdfText"] = profile.pdf_text
        doc["aiMetadata"] = ai_meta
        doc["ai_metadata"] = ai_meta

        db = None if self.use_in_memory else await get_mongo_db()
        if db is not None:
            await db[self.collection_name].replace_one(
                {"$or": [{"_id": profile.evidence_id}, {"evidence_id": profile.evidence_id}]},
                doc,
                upsert=True
            )
            logger.info("[repository] Saved EvidenceProfile to 'evidences' collection", extra={"evidence_id": profile.evidence_id, "case_id": profile.case_id})
        else:
            self._in_memory[profile.evidence_id] = doc
            logger.info("[repository] Saved EvidenceProfile in-memory", extra={"evidence_id": profile.evidence_id})

    async def get_by_evidence_id(self, evidence_id: str) -> Optional[EvidenceProfile]:
        db = None if self.use_in_memory else await get_mongo_db()
        if db is not None:
            doc = await db[self.collection_name].find_one({"$or": [{"_id": evidence_id}, {"evidence_id": evidence_id}]})
            if doc:
                doc.pop("_id", None)
                return EvidenceProfile.model_validate(doc)
            return None
        else:
            doc = self._in_memory.get(evidence_id)
            if doc:
                d = dict(doc)
                d.pop("_id", None)
                return EvidenceProfile.model_validate(d)
            return None

    async def get_all_for_case(self, case_id: str) -> List[EvidenceProfile]:
        db = None if self.use_in_memory else await get_mongo_db()
        if db is not None:
            from bson import ObjectId
            or_conditions = [{"case_id": case_id}]
            if ObjectId.is_valid(case_id):
                or_conditions.append({"case_id": ObjectId(case_id)})
            cursor = db[self.collection_name].find({"$or": or_conditions})
            docs = await cursor.to_list(length=500)
            results = []
            for d in docs:
                d.pop("_id", None)
                results.append(EvidenceProfile.model_validate(d))
            return results
        else:
            results = []
            for doc in self._in_memory.values():
                if str(doc.get("case_id")) == str(case_id):
                    d = dict(doc)
                    d.pop("_id", None)
                    results.append(EvidenceProfile.model_validate(d))
            return results

