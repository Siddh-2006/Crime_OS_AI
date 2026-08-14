"""
Complaint intelligence endpoints.
Provides synchronous profiling and asynchronous full-pipeline trigger support.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
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
        "You are a police complaint intake assistant for Gujarat Police. "
        "Your job is to extract structured fields from complaint text and uploaded documents/media. "
        "\n\n"
        "ABSOLUTE RULES — you must follow all of these without exception:\n"
        "1. Return ONLY a valid JSON object. No markdown, no code blocks, no explanations.\n"
        "2. Every field in the JSON MUST have a value. NEVER return null for any field.\n"
        "3. If a field cannot be extracted from the text or attachments, INFER a reasonable value "
        "   from context or use a sensible placeholder (e.g. 'Not specified' for text fields, "
        "   'OTHER' for category, today's date for incidentDate if completely unknown).\n"
        "4. For detailedDescription: combine EVERYTHING — complaint text AND all attachment "
        "   content — into one comprehensive, coherent first-person narrative paragraph.\n"
        "5. For shortDescription: create a crisp incident title (max 100 characters) that "
        "   summarises the core offence. Example: 'Online fraud via UPI payment of Rs. 50,000'.\n"
        "6. For incidentDate: extract any date mentioned. If only approximate ('last week', "
        "   'few days ago'), compute a plausible YYYY-MM-DD. If truly unknown, use today's date.\n"
        "7. For incidentTime: extract any time mention. If period ('evening', 'night') is given, "
        "   keep it as-is. If completely unknown, write 'Unknown'.\n"
        "8. For incidentPlace: extract any location, address, city, or landmark. If not explicit, "
        "   infer from context (e.g. bank name, website, city mentioned in document). "
        "   If still unknown, write 'Location not specified'.\n"
        "9. For category: choose EXACTLY one from the allowed list. Prefer the most specific match. "
        "   Default to 'CYBERCRIME' if digital/financial fraud is mentioned, 'OTHER' otherwise.\n"
        "10. missingFields: list only fields the complainant should manually verify or correct, "
        "    NOT fields you filled with inferred values.\n"
    )

    # Build attachment block with clear labels
    if attachment_notes:
        attachment_block = "CONTENT EXTRACTED FROM UPLOADED FILES:\n" + "\n".join(
            f"  [{i+1}] {note}" for i, note in enumerate(attachment_notes)
        )
    else:
        attachment_block = "UPLOADED FILES: None"

    # Build existing-context block (skip empty values)
    filled_context = {k: v for k, v in context.items() if v and str(v).strip()}
    context_block = (
        "ALREADY FILLED BY USER (do NOT overwrite unless empty or clearly wrong):\n"
        + json.dumps(filled_context, ensure_ascii=False, indent=2)
        if filled_context else "ALREADY FILLED BY USER: Nothing filled yet"
    )

    user_prompt = f"""Analyse the following complaint information and extract ALL fields.

--- COMPLAINT TEXT (typed by user) ---
{complaint_text if complaint_text.strip() else "(no text provided — extract entirely from uploaded files)"}

--- {attachment_block} ---

--- {context_block} ---

Return a JSON object with EXACTLY these fields (ALL values required, no nulls):

{{
  "shortDescription": "<concise incident title, max 100 chars>",
  "detailedDescription": "<full coherent narrative combining complaint text + all attachment content, written as the complainant's statement>",
  "incidentDate": "<YYYY-MM-DD — extract from text/docs; if approximate, estimate; if unknown use today's date>",
  "incidentTime": "<HH:MM in 24h, or a period like 'morning'/'evening'/'night', or 'Unknown'>",
  "incidentPlace": "<full address or location where incident occurred; infer from docs/context if not explicit>",
  "approximateDateText": "<original date phrasing if approximate e.g. 'last Tuesday', 'few days ago'; empty string if exact date known>",
  "coordinates": "<lat,lng if extractable from document, otherwise empty string>",
  "address": "<same as incidentPlace or full address if separately mentioned>",
  "category": "<EXACTLY one of: THEFT | ROBBERY | BURGLARY | ASSAULT | DOMESTIC_VIOLENCE | SEXUAL_OFFENCE | CYBERCRIME | FRAUD | PROPERTY_DISPUTE | MISSING_PERSON | ROAD_ACCIDENT | DRUG_OFFENCE | PUBLIC_NUISANCE | HARASSMENT | EXTORTION | MURDER | KIDNAPPING | OTHER>",
  "missingFields": ["<list field names that definitely need manual correction by user>"],
  "confidence": <float 0.0–1.0 reflecting how complete the extraction is>,
  "summary": "<2-3 sentence plain English summary of the incident for officer review>"
}}

IMPORTANT: Extract from BOTH the complaint text AND every attachment. Do not leave any field empty or null."""

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
        
        # Handle case where LLM returns data nested in 'context' key
        if "context" in parsed_output and isinstance(parsed_output["context"], dict):
            context_data = parsed_output["context"]
            # Merge context data into root if fields are missing at root
            for key in ["shortDescription", "detailedDescription", "incidentDate", "incidentTime", "incidentPlace", "approximateDateText", "coordinates", "address", "category"]:
                if not parsed_output.get(key) and context_data.get(key):
                    parsed_output[key] = context_data[key]
        
        logger.info("[complaint] LLM parsed output keys", extra={"keys": list(parsed_output.keys()), "shortDescription": parsed_output.get("shortDescription"), "incidentDate": parsed_output.get("incidentDate"), "incidentTime": parsed_output.get("incidentTime"), "incidentPlace": parsed_output.get("incidentPlace"), "category": parsed_output.get("category")})
    except Exception as exc:
        logger.warning("[complaint] LLM complaint intake drafting failed; using fallback draft", extra={"error": str(exc)})

    combined_text = complaint_text or " ".join(attachment_notes).strip()

    # ── Hard fallbacks for fields that must never be null ──────────────────────
    from datetime import date as _date
    _today = _date.today().isoformat()           # YYYY-MM-DD — last-resort for incidentDate
    _first_sentence = (combined_text.split(".")[0].strip()[:97] + "...") \
        if combined_text and len(combined_text) > 100 else combined_text or None

    prefill = ComplaintDraftFields(
        shortDescription=_first_non_empty(
            parsed_output.get("shortDescription"),
            parsed_output.get("short_description"),
            parsed_context.get("shortDescription"),
            _first_sentence,          # last-resort: first sentence of text
        ),
        detailedDescription=_first_non_empty(
            parsed_output.get("detailedDescription"),
            parsed_output.get("detailed_description"),
            parsed_context.get("detailedDescription"),
        ) or (combined_text if combined_text else None),
        incidentDate=_first_non_empty(
            parsed_output.get("incidentDate"),
            parsed_output.get("incident_date"),
            parsed_context.get("incidentDate"),
            _today,                   # last-resort: today's date when completely unknown
        ),
        incidentTime=_first_non_empty(
            parsed_output.get("incidentTime"),
            parsed_output.get("incident_time"),
            parsed_output.get("time"),
            parsed_output.get("period"),
            parsed_output.get("time_of_day"),
            parsed_context.get("incidentTime"),
            "Unknown",                # last-resort: explicit unknown marker
        ),
        incidentPlace=_first_non_empty(
            parsed_output.get("incidentPlace"),
            parsed_output.get("incident_place"),
            parsed_output.get("location"),
            parsed_output.get("place"),
            parsed_output.get("address"),
            parsed_context.get("incidentPlace"),
            parsed_context.get("address"),
            "Location not specified", # last-resort so the field is never null
        ),
        approximateDateText=_first_non_empty(
            parsed_output.get("approximateDateText"),
            parsed_output.get("approximate_date"),
            parsed_output.get("date_range"),
            parsed_context.get("approximateDateText"),
        ),
        coordinates=_first_non_empty(
            parsed_output.get("coordinates"),
            parsed_context.get("coordinates"),
        ),
        address=_first_non_empty(
            parsed_output.get("address"),
            parsed_output.get("incidentPlace"),
            parsed_context.get("address"),
            parsed_context.get("incidentPlace"),
        ),
        category=_first_non_empty(
            parsed_output.get("category"),
            parsed_context.get("category"),
            "OTHER",                  # last-resort: safe default category
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
            try:
                line = await asyncio.to_thread(process.stdout.readline)
            except Exception as read_err:
                logger.warning(f"Error reading stdout line: {read_err}")
                continue
            if not line:
                break
            message = line.rstrip()
            if message:
                print(message, flush=True)
                logger.info(
                    "Complaint intelligence pipeline output",
                    extra={"complaint_number": complaint_number, "stdout": message},
                )
    except Exception as exc:
        logger.warning(f"Pipeline output stream ended: {exc}")
    finally:
        if process.poll() is None:
            try:
                process.terminate()
            except Exception:
                pass
        logger.info(
            "Complaint intelligence pipeline process exited",
            extra={"complaint_number": complaint_number, "return_code": process.poll()},
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
    try:
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
            encoding="utf-8",
            errors="replace",
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
    except Exception as exc:
        import traceback
        traceback.print_exc()
        logger.error(f"[trigger_full_pipeline ERROR] {exc}", exc_info=True)
        if isinstance(exc, HTTPException):
            raise exc
        raise HTTPException(status_code=500, detail=str(exc))
