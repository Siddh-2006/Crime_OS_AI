"""
Complaint intelligence endpoints.
Provides synchronous profiling and asynchronous full-pipeline trigger support.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.api.deps import get_di_container
from app.core.container import Container
from app.core.exceptions import LLMError
from app.core.logging import logger
from app.schemas.case_context import EvidenceItem
from app.llm.worker import ComplaintProfileWorker
from app.schemas.complaint import ComplaintProfile

router = APIRouter(tags=["Complaint"])


class ProfileRequest(BaseModel):
    text: str


class TriggerFullPipelineRequest(BaseModel):
    complaint_number: str


class ComplaintDraftFields(BaseModel):
    shortDescription: str | None = None
    detailedDescription: str | None = None
    incidentDate: str | None = None
    incidentTime: str | None = None
    incidentPlace: str | None = None
    approximateDateText: str | None = None
    coordinates: str | None = None
    address: str | None = None
    category: str | None = None


class ComplaintDraftIntakeResponse(BaseModel):
    prefill: ComplaintDraftFields = Field(default_factory=ComplaintDraftFields)
    missing_fields: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0)
    files: list[EvidenceItem] = Field(default_factory=list)
    summary: str = Field(default="")


def _clean_json_payload(raw: str) -> dict[str, object]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]

    parsed = json.loads(text)
    return parsed if isinstance(parsed, dict) else {}


def _first_non_empty(*values: object) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _build_multimodal_prompt(
    complaint_text: str,
    attachment_notes: list[str],
    context: dict[str, object],
) -> tuple[str, str]:
    system_prompt = (
        "You extract a complaint draft from user text plus OCR, Florence captions, and audio/PDF transcription. "
        "Return ONLY a raw JSON object. Do not add markdown, commentary, or explanations. "
        "Use only facts grounded in the provided text and attachment notes. "
        "When generating detailedDescription, write a clear paragraph-style complaint narrative that combines the complaint text with the extracted media content and preserves the important factual sequence."
    )

    payload = {
        "complaint_text": complaint_text,
        "context": context,
        "attachment_notes": attachment_notes,
        "required_output": {
            "shortDescription": "short title for the complaint",
            "detailedDescription": "full paragraph-style complaint narrative generated from the complaint text and all extracted media text",
            "incidentDate": "YYYY-MM-DD if derivable, otherwise null",
            "incidentTime": "exact time or broad period if derivable, otherwise null",
            "incidentPlace": "location of occurrence if derivable, otherwise null",
            "approximateDateText": "free-form approximate date text if derivable, otherwise null",
            "coordinates": "GPS coordinates if derivable, otherwise null",
            "address": "full address if derivable, otherwise null",
            "category": "one of THEFT, ROBBERY, BURGLARY, ASSAULT, DOMESTIC_VIOLENCE, SEXUAL_OFFENCE, CYBERCRIME, FRAUD, PROPERTY_DISPUTE, MISSING_PERSON, ROAD_ACCIDENT, DRUG_OFFENCE, PUBLIC_NUISANCE, HARASSMENT, EXTORTION, MURDER, KIDNAPPING, OTHER — pick the closest match, or null if unclear",
            "missingFields": ["fields that still require manual entry"],
            "confidence": 0.0,
            "summary": "brief textual summary of the evidence-backed draft",
        },
    }
    user_prompt = json.dumps(payload, ensure_ascii=False, indent=2)
    return system_prompt, user_prompt


@router.post(
    "/profile-complaint-multimodal",
    response_model=ComplaintDraftIntakeResponse,
    status_code=status.HTTP_200_OK,
    summary="Profile a complaint from text plus image, PDF, and audio attachments",
    description=(
        "Analyzes the complaint text together with uploaded images, PDFs, and audio recordings. "
        "Runs Florence-2, PaddleOCR, Whisper, and PDF extraction where appropriate, then returns "
        "a draft that only fills fields already present in the complaint schema."
    ),
)
async def profile_complaint_multimodal(
    container: Annotated[Container, Depends(get_di_container)],
    text: str = Form(default=""),
    context: str = Form(default=""),
    files: list[UploadFile] = File(default=[]),
) -> ComplaintDraftIntakeResponse:
    complaint_text = text.strip()
    parsed_context: dict[str, object] = {}
    if context.strip():
        try:
            maybe_context = json.loads(context)
            if isinstance(maybe_context, dict):
                parsed_context = maybe_context
        except Exception:
            parsed_context = {"raw_context": context}

    attachment_notes: list[str] = []
    evidence_items: list[EvidenceItem] = []

    for upload in files:
        filename = upload.filename or "upload"
        content_type = (upload.content_type or "").lower().split(";")[0].strip()
        file_bytes = await upload.read()
        if not file_bytes:
            continue

        ext = filename.split(".")[-1].lower() if "." in filename else ""
        file_id = f"draft-{len(evidence_items) + 1}-{filename}"
        b64 = base64.b64encode(file_bytes).decode("utf-8")

        if content_type.startswith("image/") or ext in ("png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif"):
            florence_desc: str | None = None
            ocr_text: str | None = None

            try:
                img_res = await container.image_worker.run(
                    {"image_bytes_b64": b64, "file_name": filename, "file_size_bytes": len(file_bytes)},
                    job_id=f"intake-img-{file_id}",
                )
                if img_res.succeeded and img_res.output:
                    analysis = img_res.output.get("analysis")
                    if isinstance(analysis, dict):
                        florence_desc = _first_non_empty(analysis.get("description"), analysis.get("summary"))
            except Exception as exc:
                logger.warning("[complaint] Intake image worker failed", extra={"filename": filename, "error": str(exc)})

            try:
                ocr_res = await container.ocr_worker.run(
                    {"image_bytes_b64": b64, "file_name": filename, "evidence_id": file_id},
                    job_id=f"intake-ocr-{file_id}",
                )
                if ocr_res.succeeded and ocr_res.output:
                    res_data = ocr_res.output.get("ocr_result", {})
                    if isinstance(res_data, dict):
                        ocr_text = _first_non_empty(res_data.get("translated_text"), res_data.get("raw_text"))
            except Exception as exc:
                logger.warning("[complaint] Intake OCR worker failed", extra={"filename": filename, "error": str(exc)})

            evidence_items.append(
                EvidenceItem(
                    id=file_id,
                    filename=filename,
                    type="image",
                    florence_description=florence_desc,
                    ocr_text=ocr_text,
                    metadata={"size_bytes": len(file_bytes), "mime_type": content_type or upload.content_type or ""},
                )
            )
            attachment_notes.append(
                f"{filename}: image description={florence_desc or 'n/a'}; OCR={ocr_text or 'n/a'}"
            )
            continue

        if content_type.startswith("audio/") or ext in ("mp3", "wav", "m4a", "ogg", "flac", "opus"):
            transcript: str | None = None
            try:
                audio_res = await container.audio_worker.run(
                    {"audio_bytes_b64": b64, "file_name": filename},
                    job_id=f"intake-aud-{file_id}",
                )
                if audio_res.succeeded and audio_res.output:
                    audio_output = audio_res.output.get("transcript")
                    if isinstance(audio_output, dict):
                        transcript = _first_non_empty(
                            audio_output.get("translated_text"),
                            audio_output.get("translatedText"),
                            audio_output.get("raw_text"),
                            audio_output.get("rawText"),
                        )
                    else:
                        transcript = _first_non_empty(
                            audio_output,
                            audio_res.output.get("audio_transcript"),
                        )
            except Exception as exc:
                logger.warning("[complaint] Intake audio worker failed", extra={"filename": filename, "error": str(exc)})

            evidence_items.append(
                EvidenceItem(
                    id=file_id,
                    filename=filename,
                    type="audio",
                    transcript=transcript,
                    metadata={"size_bytes": len(file_bytes), "mime_type": content_type or upload.content_type or ""},
                )
            )
            attachment_notes.append(f"{filename}: audio transcript={transcript or 'n/a'}")
            continue

        if content_type == "application/pdf" or ext == "pdf":
            pdf_text: str | None = None
            ocr_text: str | None = None
            try:
                pdf_res = await container.pdf_worker.run(
                    {"pdf_bytes_b64": b64, "file_name": filename},
                    job_id=f"intake-pdf-{file_id}",
                )
                if pdf_res.succeeded and pdf_res.output:
                    pdf_text = _first_non_empty(pdf_res.output.get("merged_text"), pdf_res.output.get("mergedText"))
                    ocr_text = None  # merged_text already contains OCR output for scanned pages
            except Exception as exc:
                logger.warning("[complaint] Intake PDF worker failed", extra={"filename": filename, "error": str(exc)})

            evidence_items.append(
                EvidenceItem(
                    id=file_id,
                    filename=filename,
                    type="pdf",
                    pdf_text=pdf_text,
                    ocr_text=ocr_text,
                    metadata={"size_bytes": len(file_bytes), "mime_type": content_type or upload.content_type or ""},
                )
            )
            attachment_notes.append(f"{filename}: pdf text={pdf_text or ocr_text or 'n/a'}")
            continue

        text_content = file_bytes.decode("utf-8", errors="ignore").strip()
        if text_content:
            evidence_items.append(
                EvidenceItem(
                    id=file_id,
                    filename=filename,
                    type="document",
                    pdf_text=text_content,
                    metadata={"size_bytes": len(file_bytes), "mime_type": content_type or upload.content_type or ""},
                )
            )
            attachment_notes.append(f"{filename}: text={text_content[:500]}")

    if not complaint_text and not attachment_notes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide complaint text or upload at least one file.")

    system_prompt, user_prompt = _build_multimodal_prompt(complaint_text, attachment_notes, parsed_context)
    raw_response: str | None = None
    parsed_output: dict[str, object] = {}

    try:
        raw_response = await container.llm_client.generate(user_prompt, system_prompt=system_prompt)
        logger.info("[complaint] LLM raw response", extra={"raw_response": raw_response[:500] if raw_response else None})
        parsed_output = _clean_json_payload(raw_response)
        logger.info("[complaint] LLM parsed output keys", extra={"keys": list(parsed_output.keys()), "shortDescription": parsed_output.get("shortDescription"), "incidentDate": parsed_output.get("incidentDate"), "incidentTime": parsed_output.get("incidentTime"), "incidentPlace": parsed_output.get("incidentPlace"), "category": parsed_output.get("category")})
    except Exception as exc:
        logger.warning("[complaint] LLM complaint intake drafting failed; using fallback draft", extra={"error": str(exc)})

    combined_text = complaint_text or " ".join(attachment_notes).strip()
    if not combined_text:
        combined_text = "Complaint intake provided via attachments only."

    prefill = ComplaintDraftFields(
        shortDescription=_first_non_empty(
            parsed_output.get("shortDescription"),
            parsed_output.get("short_description"),
            parsed_context.get("shortDescription"),
        ) or (complaint_text[:120] if complaint_text else None),
        detailedDescription=_first_non_empty(
            parsed_output.get("detailedDescription"),
            parsed_output.get("detailed_description"),
            parsed_context.get("detailedDescription"),
        ) or combined_text,
        incidentDate=_first_non_empty(
            parsed_output.get("incidentDate"),
            parsed_context.get("incidentDate"),
        ),
        incidentTime=_first_non_empty(
            parsed_output.get("incidentTime"),
            parsed_context.get("incidentTime"),
        ),
        incidentPlace=_first_non_empty(
            parsed_output.get("incidentPlace"),
            parsed_output.get("address"),
            parsed_context.get("incidentPlace"),
        ),
        approximateDateText=_first_non_empty(
            parsed_output.get("approximateDateText"),
            parsed_context.get("approximateDateText"),
        ),
        coordinates=_first_non_empty(
            parsed_output.get("coordinates"),
            parsed_context.get("coordinates"),
        ),
        address=_first_non_empty(
            parsed_output.get("address"),
            parsed_context.get("address"),
        ),
        category=_first_non_empty(
            parsed_output.get("category"),
            parsed_context.get("category"),
        ),
    )

    missing_fields = parsed_output.get("missingFields") or parsed_output.get("missing_fields") or []
    if not isinstance(missing_fields, list):
        missing_fields = []

    confidence = parsed_output.get("confidence")
    try:
        confidence_value = float(confidence) if confidence is not None else 0.0  # type: ignore
    except Exception:
        confidence_value = 0.0

    summary = _first_non_empty(
        parsed_output.get("summary"),
        parsed_output.get("detailedDescription"),
        parsed_output.get("detailed_description"),
        complaint_text,
        combined_text,
    ) or ""

    logger.info("[complaint] Final prefill being returned", extra={"prefill": prefill.model_dump()})

    return ComplaintDraftIntakeResponse(
        prefill=prefill,
        missing_fields=[str(item) for item in missing_fields if str(item).strip()],
        confidence=confidence_value,
        files=evidence_items,
        summary=summary,
    )


async def _stream_pipeline_output(process: subprocess.Popen[str], complaint_number: str) -> None:
    if process.stdout is None:
        logger.warning(
            "Complaint intelligence pipeline started without an output stream",
            extra={"complaint_number": complaint_number},
        )
        return

    try:
        while True:
            line = await asyncio.to_thread(process.stdout.readline)
            if not line:
                break
            message = line.rstrip()
            if message:
                logger.info(
                    "Complaint intelligence pipeline output",
                    extra={"complaint_number": complaint_number, "stdout": message},
                )
    finally:
        return_code = process.wait()
        logger.info(
            "Complaint intelligence pipeline process exited",
            extra={"complaint_number": complaint_number, "return_code": return_code},
        )


@router.post(
    "/profile-complaint",
    response_model=ComplaintProfile,
    status_code=status.HTTP_200_OK,
    summary="Profile a complaint synchronously",
    description="Analyze a raw complaint text, detect language, translate if necessary, "
                "and return a structured profile of the complaint.",
)
async def profile_complaint(
    body: ProfileRequest,
    container: Annotated[Container, Depends(get_di_container)],
) -> ComplaintProfile:
    # Run the profiling logic synchronously by invoking the worker
    worker = ComplaintProfileWorker(container.llm_client)
    result = await worker.run(payload={"text": body.text}, job_id="sync-profile")

    if not result.succeeded:
        raise LLMError(f"Complaint profiling failed: {result.error}")

    # The result.output is a dict matching ComplaintProfile
    return ComplaintProfile.model_validate(result.output)


@router.post(
    "/trigger-full-pipeline",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger the full complaint intelligence pipeline asynchronously",
    description="Starts the complaint intelligence orchestration from the Python service and returns immediately.",
)
async def trigger_full_pipeline(body: TriggerFullPipelineRequest) -> dict[str, object]:
    complaint_number = body.complaint_number.strip()
    if not complaint_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="complaint_number is required")

    script_path = Path(__file__).resolve().parents[3] / "run_pipeline_from_atlas.py"
    if not script_path.exists():
        script_path = Path(__file__).resolve().parents[3] / "run_full_pipeline.py"
    if not script_path.exists():
        logger.error(
            "Complaint intelligence full-pipeline script not found",
            extra={"complaint_number": complaint_number, "script_path": str(script_path)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Full pipeline script does not exist on disk",
        )

    logger.info(
        "Full complaint pipeline trigger received over HTTP",
        extra={"complaint_number": complaint_number, "script_path": str(script_path)},
    )

    process = subprocess.Popen(
        [sys.executable, "-u", str(script_path), complaint_number],
        cwd=str(script_path.parent),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        env={**os.environ, "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1"},
    )

    asyncio.create_task(_stream_pipeline_output(process, complaint_number))

    return {
        "accepted": True,
        "complaint_number": complaint_number,
        "status": "started",
        "message": "Full complaint intelligence pipeline launch accepted by complaint_intelligence service.",
    }
