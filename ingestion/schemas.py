from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime, timezone
from typing import Any, ClassVar, Iterable, Optional

try:  # pragma: no cover - exercised when dependency exists
    from pydantic import BaseModel, ConfigDict, Field
except Exception:  # pragma: no cover - fallback for offline environments
    class _FieldSpec:
        def __init__(self, default: Any = None, default_factory: Any = None) -> None:
            self.default = default
            self.default_factory = default_factory

        def resolve(self) -> Any:
            if self.default_factory is not None:
                return self.default_factory()
            return self.default

    class BaseModel:  # type: ignore[override]
        model_config: ClassVar[dict[str, Any]] = {}

        def __init__(self, **data: Any) -> None:
            annotations = getattr(self.__class__, "__annotations__", {})
            for key in annotations:
                class_value = getattr(self.__class__, key, None)
                if isinstance(class_value, _FieldSpec):
                    value = class_value.resolve()
                elif hasattr(self.__class__, key):
                    value = class_value
                else:
                    value = None
                setattr(self, key, data.pop(key, value))
            for key, value in data.items():
                setattr(self, key, value)

        @classmethod
        def model_validate(cls, data: Any):
            if isinstance(data, cls):
                return data
            if is_dataclass(data):
                return cls(**asdict(data))
            if isinstance(data, dict):
                return cls(**data)
            raise TypeError(f"Cannot validate {type(data)!r}")

        def model_dump(self, *, mode: str | None = None, exclude_none: bool = False) -> dict[str, Any]:
            def _serialize(value: Any) -> Any:
                if isinstance(value, BaseModel):
                    return value.model_dump(exclude_none=exclude_none)
                if is_dataclass(value):
                    return asdict(value)
                if isinstance(value, list):
                    return [_serialize(item) for item in value]
                if isinstance(value, tuple):
                    return [_serialize(item) for item in value]
                if isinstance(value, dict):
                    return {key: _serialize(item) for key, item in value.items()}
                if hasattr(value, "isoformat"):
                    try:
                        return value.isoformat()
                    except Exception:
                        return value
                return value

            data = dict(self.__dict__)
            if exclude_none:
                data = {key: value for key, value in data.items() if value is not None}
            return {key: _serialize(value) for key, value in data.items()}

        def model_dump_json(self, *, indent: int | None = None) -> str:
            import json

            return json.dumps(self.model_dump(exclude_none=True), ensure_ascii=False, indent=indent)

        def json(self, *, indent: int | None = None) -> str:
            return self.model_dump_json(indent=indent)

    def Field(default: Any = None, *, default_factory: Any | None = None, **_: Any) -> Any:  # type: ignore[misc]
        return _FieldSpec(default=default, default_factory=default_factory)

    class ConfigDict(dict):
        pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CrimeOSModel(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class DocumentMetadata(CrimeOSModel):
    source_path: str = ""
    source_filename: str = ""
    parser_name: str = ""
    parser_version: str = "1.0"
    source_pages: list[int] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utc_now)
    extra: dict[str, Any] = Field(default_factory=dict)


class ClauseRecord(CrimeOSModel):
    id: str = ""
    content: str = ""
    references: list[str] = Field(default_factory=list)
    page: int = 0
    source_page: int = 0
    source_pages: list[int] = Field(default_factory=list)


class SubsectionRecord(CrimeOSModel):
    id: str = ""
    content: str = ""
    references: list[str] = Field(default_factory=list)
    page: int = 0
    source_page: int = 0
    source_pages: list[int] = Field(default_factory=list)
    clauses: list[ClauseRecord] = Field(default_factory=list)


class LegalSectionRecord(CrimeOSModel):
    id: str = ""
    document_type: str = "legal_act"
    act: str = ""
    serial_number: str = ""
    chapter: str = ""
    chapter_tag: list[str] = Field(default_factory=list)
    content: str = ""
    summary: str = ""
    references: list[str] = Field(default_factory=list)
    clauses: list[ClauseRecord] = Field(default_factory=list)
    subsections: list[SubsectionRecord] = Field(default_factory=list)
    page: int = 0
    source_page: int = 0
    source_pages: list[int] = Field(default_factory=list)
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)


class SOPRecord(CrimeOSModel):
    id: str = ""
    document_type: str = "sop_manual"
    act: str = "NCRP"
    document: str = "NCRP_SOP"
    chapter: str | None = None
    section: str | None = None
    subsection: str | None = None
    content: str = ""
    source_page: int = 0
    source_pages: list[int] = Field(default_factory=list)
    hierarchy: list[str] = Field(default_factory=list)
    metadata: DocumentMetadata = Field(default_factory=DocumentMetadata)
