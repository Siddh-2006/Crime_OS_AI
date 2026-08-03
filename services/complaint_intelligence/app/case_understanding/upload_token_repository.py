"""
Repository for UploadToken and EvidenceRecord documents.
Follows Repository Pattern: interface + MongoDB implementation.
Business logic depends only on the interface — never on Motor directly.

MongoDB collections:
  upload_tokens   — one document per case (unique index on `token` and `case_id`)
  evidence_records — one document per uploaded file, created before processing
"""
from __future__ import annotations

import secrets
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import List, Optional

from app.core.logging import logger
from app.core.mongo import get_mongo_db
from app.schemas.upload_token import (
    EvidenceProcessingStatus,
    EvidenceRecord,
    UploadMetadata,
    UploadToken,
)


# ── UploadToken Repository ────────────────────────────────────────────────────

class IUploadTokenRepository(ABC):
    """Abstract contract for upload-token persistence."""

    @abstractmethod
    async def create(
        self,
        case_id: str,
        complaint_number: Optional[str],
        upload_url: str,
    ) -> UploadToken:
        """Generate a new secure token and persist it. Returns the saved token."""
        ...

    @abstractmethod
    async def get_by_token(self, token: str) -> Optional[UploadToken]:
        """Fetch a token document by its token string."""
        ...

    @abstractmethod
    async def get_by_case_id(self, case_id: str) -> Optional[UploadToken]:
        """Fetch the token associated with a case."""
        ...

    @abstractmethod
    async def get_or_create(
        self,
        case_id: str,
        complaint_number: Optional[str],
        upload_url_template: str,
    ) -> UploadToken:
        """Return existing token for the case, or create one if absent (idempotent)."""
        ...

    @abstractmethod
    async def revoke(self, token: str) -> None:
        """Mark a token as revoked. Idempotent."""
        ...

    @abstractmethod
    async def revoke_by_case_id(self, case_id: str) -> None:
        """Revoke all tokens for a case (called on case closure)."""
        ...

    @abstractmethod
    async def increment_upload_count(self, token: str) -> None:
        """Atomically increment upload_count and set last_upload_at."""
        ...


class MongoUploadTokenRepository(IUploadTokenRepository):
    """Motor-backed implementation of IUploadTokenRepository."""

    def __init__(self, collection_name: str = "upload_tokens") -> None:
        self.collection_name = collection_name

    async def _col(self):
        db = await get_mongo_db()
        if db is None:
            raise RuntimeError("MongoDB unavailable — cannot operate on upload_tokens")
        return db[self.collection_name]

    async def create(
        self,
        case_id: str,
        complaint_number: Optional[str],
        upload_url: str,
    ) -> UploadToken:
        token_str = secrets.token_urlsafe(32)   # 256-bit entropy
        ut = UploadToken(
            token=token_str,
            case_id=case_id,
            complaint_number=complaint_number,
            upload_url=upload_url,
        )
        doc = ut.model_dump(mode="json")
        doc["_id"] = token_str
        col = await self._col()
        await col.insert_one(doc)
        logger.info(
            "[upload_token_repo] Created upload token",
            extra={"case_id": case_id, "token_prefix": token_str[:8]},
        )
        return ut

    async def get_by_token(self, token: str) -> Optional[UploadToken]:
        col = await self._col()
        doc = await col.find_one({"_id": token})
        if not doc:
            return None
        doc.pop("_id", None)
        return UploadToken.model_validate(doc)

    async def get_by_case_id(self, case_id: str) -> Optional[UploadToken]:
        col = await self._col()
        doc = await col.find_one({"case_id": case_id})
        if not doc:
            return None
        doc.pop("_id", None)
        return UploadToken.model_validate(doc)

    async def get_or_create(
        self,
        case_id: str,
        complaint_number: Optional[str],
        upload_url_template: str,
    ) -> UploadToken:
        """
        Idempotent: returns existing token if one already exists for this case.
        upload_url_template must contain a `{token}` placeholder which is
        replaced with the generated token string.
        """
        existing = await self.get_by_case_id(case_id)
        if existing:
            logger.info(
                "[upload_token_repo] Returning existing upload token",
                extra={"case_id": case_id},
            )
            return existing

        # Generate token first so we can build the URL
        token_str = secrets.token_urlsafe(32)
        upload_url = upload_url_template.replace("{token}", token_str)
        ut = UploadToken(
            token=token_str,
            case_id=case_id,
            complaint_number=complaint_number,
            upload_url=upload_url,
        )
        doc = ut.model_dump(mode="json")
        doc["_id"] = token_str
        col = await self._col()
        await col.insert_one(doc)
        logger.info(
            "[upload_token_repo] Created new upload token (get_or_create)",
            extra={"case_id": case_id, "token_prefix": token_str[:8]},
        )
        return ut

    async def revoke(self, token: str) -> None:
        col = await self._col()
        await col.update_one({"_id": token}, {"$set": {"is_revoked": True}})
        logger.info("[upload_token_repo] Token revoked", extra={"token_prefix": token[:8]})

    async def revoke_by_case_id(self, case_id: str) -> None:
        col = await self._col()
        result = await col.update_many({"case_id": case_id}, {"$set": {"is_revoked": True}})
        logger.info(
            "[upload_token_repo] Tokens revoked for case",
            extra={"case_id": case_id, "count": result.modified_count},
        )

    async def increment_upload_count(self, token: str) -> None:
        col = await self._col()
        now = datetime.now(timezone.utc).isoformat()
        await col.update_one(
            {"_id": token},
            {"$inc": {"upload_count": 1}, "$set": {"last_upload_at": now}},
        )


# ── EvidenceRecord Repository ─────────────────────────────────────────────────

class IEvidenceRecordRepository(ABC):
    """Abstract contract for raw-upload record persistence."""

    @abstractmethod
    async def save(self, record: EvidenceRecord) -> None:
        ...

    @abstractmethod
    async def get_by_evidence_id(self, evidence_id: str) -> Optional[EvidenceRecord]:
        ...

    @abstractmethod
    async def get_all_for_case(self, case_id: str) -> List[EvidenceRecord]:
        ...

    @abstractmethod
    async def update_status(
        self,
        evidence_id: str,
        status: EvidenceProcessingStatus,
        error: Optional[str] = None,
    ) -> None:
        ...

    @abstractmethod
    async def mark_completed(self, evidence_id: str, url: Optional[str] = None) -> None:
        ...


class MongoEvidenceRecordRepository(IEvidenceRecordRepository):
    """Motor-backed implementation of IEvidenceRecordRepository targeting 'evidences' collection."""

    def __init__(self, collection_name: str = "evidences") -> None:
        self.collection_name = collection_name

    async def _col(self):
        db = await get_mongo_db()
        if db is None:
            raise RuntimeError("MongoDB unavailable — cannot operate on evidences collection")
        return db[self.collection_name]

    async def save(self, record: EvidenceRecord) -> None:
        doc = record.model_dump(mode="json")
        doc["_id"] = record.evidence_id
        col = await self._col()
        await col.replace_one({"_id": record.evidence_id}, doc, upsert=True)
        logger.info(
            "[evidence_record_repo] Saved EvidenceRecord",
            extra={"evidence_id": record.evidence_id, "case_id": record.case_id},
        )

    async def get_by_evidence_id(self, evidence_id: str) -> Optional[EvidenceRecord]:
        col = await self._col()
        doc = await col.find_one({"_id": evidence_id})
        if not doc:
            return None
        doc.pop("_id", None)
        return EvidenceRecord.model_validate(doc)

    async def get_all_for_case(self, case_id: str) -> List[EvidenceRecord]:
        col = await self._col()
        cursor = col.find({"case_id": case_id})
        docs = await cursor.to_list(length=500)
        results = []
        for d in docs:
            d.pop("_id", None)
            results.append(EvidenceRecord.model_validate(d))
        return results

    async def update_status(
        self,
        evidence_id: str,
        status: EvidenceProcessingStatus,
        error: Optional[str] = None,
    ) -> None:
        col = await self._col()
        update: dict = {"$set": {"processing_status": status.value}}
        if error:
            update["$set"]["processing_error"] = error
        await col.update_one({"_id": evidence_id}, update)

    async def mark_completed(self, evidence_id: str, url: Optional[str] = None) -> None:
        col = await self._col()
        now = datetime.now(timezone.utc).isoformat()
        set_dict: dict = {
            "processing_status": EvidenceProcessingStatus.COMPLETED.value,
            "completed_at": now,
        }
        if url:
            set_dict["url"] = url
        await col.update_one(
            {"_id": evidence_id},
            {"$set": set_dict},
        )
