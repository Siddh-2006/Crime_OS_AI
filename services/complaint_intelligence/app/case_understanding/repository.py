"""
Repository implementations for Case Understanding persistence.
Supports MongoDB (Motor driver) with automatic fallback to InMemoryCaseRepository.
"""
from __future__ import annotations

from typing import Dict, Optional

from app.case_understanding.interfaces import ICaseRepository
from app.core.logging import logger
from app.core.mongo import get_mongo_db
from app.schemas.case_understanding import CaseUnderstanding


class MongoCaseRepository(ICaseRepository):
    """MongoDB repository for CaseUnderstanding documents."""

    def __init__(self, collection_name: str = "cases") -> None:
        self._collection_name = collection_name
        self._fallback_repo = InMemoryCaseRepository()

    async def save(self, case: CaseUnderstanding) -> str:
        db = await get_mongo_db()
        data = case.model_dump()
        data["_id"] = case.case_id

        if db is not None:
            try:
                await db[self._collection_name].replace_one(
                    {"_id": case.case_id}, data, upsert=True
                )
                logger.info(
                    "[repository] Saved CaseUnderstanding to MongoDB",
                    extra={"case_id": case.case_id},
                )
                return case.case_id
            except Exception as exc:
                logger.warning(
                    "[repository] MongoDB save failed, writing to fallback memory store",
                    extra={"case_id": case.case_id, "error": str(exc)},
                )

        await self._fallback_repo.save(case)
        return case.case_id

    async def get_by_id(self, case_id: str) -> Optional[CaseUnderstanding]:
        db = await get_mongo_db()
        if db is not None:
            try:
                doc = await db[self._collection_name].find_one({"_id": case_id})
                if doc:
                    doc.pop("_id", None)
                    return CaseUnderstanding.model_validate(doc)
            except Exception as exc:
                logger.warning(
                    "[repository] MongoDB read failed, checking fallback memory store",
                    extra={"case_id": case_id, "error": str(exc)},
                )

        return await self._fallback_repo.get_by_id(case_id)


class InMemoryCaseRepository(ICaseRepository):
    """In-memory repository for unit tests and offline development."""

    def __init__(self) -> None:
        self._storage: Dict[str, CaseUnderstanding] = {}

    async def save(self, case: CaseUnderstanding) -> str:
        self._storage[case.case_id] = case
        logger.info(
            "[repository] Saved CaseUnderstanding in-memory",
            extra={"case_id": case.case_id},
        )
        return case.case_id

    async def get_by_id(self, case_id: str) -> Optional[CaseUnderstanding]:
        return self._storage.get(case_id)
