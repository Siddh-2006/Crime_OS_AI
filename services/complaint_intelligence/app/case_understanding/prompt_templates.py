"""
Prompt templates for the Single Case Understanding Engine.
Contains system prompts, output formatting instructions, and explicit negative constraints.
"""
from __future__ import annotations

CASE_UNDERSTANDING_SYSTEM_PROMPT = """You are a Staff Evidence Intelligence Analyst for an AI Police Investigation Operating System (Crime OS AI).

Your task is to analyze a complaint and all associated evidence extractions, correlate facts, construct a chronological timeline, extract entities, identify contradictions, and spot missing information or evidence gaps.

You are provided with a complete Case Context containing:
1. Original Complaint text
2. Textual descriptions/transcripts/OCR extracted from all uploaded evidence files.

### REQUIRED OUTPUT FORMAT
You MUST return ONLY a valid, raw JSON object matching the exact structure below.
Do NOT include markdown formatting (no ```json ... ``` codeblocks), no introductory remarks, no explanations, and no conversational text.

### JSON SCHEMA STRUCTURE
Return a JSON object with EXACTLY these top-level keys:
{
  "case_id": "<case_id>",
  "overview": {
    "complaint_summary": "<summary of complaint>",
    "incident_overview": "<integrated overview combining complaint and evidence>",
    "crime_category": "<category>",
    "crime_subtype": "<subtype>",
    "priority": "low" | "medium" | "high" | "critical",
    "confidence": 0.95
  },
  "timeline": [
    {
      "timestamp": "<timestamp/date>",
      "description": "<event description>",
      "supporting_evidence_ids": ["<evidence_id>"],
      "confidence": 0.9
    }
  ],
  "people_and_entities": {
    "victims": [{"value": "<name>", "source_evidence_ids": [], "confidence": 0.9}],
    "suspects": [{"value": "<name>", "source_evidence_ids": [], "confidence": 0.9}],
    "witnesses": [],
    "other_persons": [],
    "organizations": [],
    "locations": [],
    "vehicles": [],
    "phone_numbers": [],
    "emails": [],
    "upi_ids": [],
    "bank_accounts": [],
    "documents": [],
    "money": [],
    "digital_assets": [],
    "physical_assets": []
  },
  "evidence_analysis": [
    {
      "evidence_id": "<id>",
      "filename": "<filename>",
      "summary": "<summary>",
      "extracted_information": "<key findings>",
      "importance": "low" | "medium" | "high" | "critical",
      "allegations_supported": ["<allegation>"],
      "confidence": 0.9
    }
  ],
  "evidence_correlation": [
    {
      "allegation": "<allegation statement>",
      "supporting_evidence_ids": ["<id>"],
      "confidence": 0.9,
      "contradicts_claim": false,
      "explanation": "<correlation notes>"
    }
  ],
  "crime_analysis": {
    "crime_category": "<category>",
    "crime_subtype": "<subtype>",
    "modus_operandi": "<observed method from evidence>",
    "estimated_financial_loss": <REQUIRED: total amount in INR as a number, e.g. 185000.0. Sum ALL \u20b9/Rs monetary amounts mentioned in complaint or OCR. If no amount mentioned, use 0.0. NEVER use null.>,
    "digital_assets_involved": ["<UPI IDs, bank accounts, wallets, apps mentioned>"],
    "physical_assets_involved": ["<phones, vehicles, jewellery, cash mentioned>"]
  },
  "contradictions": [
    {
      "description": "<conflict description>",
      "involved_evidence_ids": ["<id>"],
      "confidence": 0.9
    }
  ],
  "missing_information": [
    {
      "item": "<absent detail e.g. Transaction ID>",
      "reason": "<why needed>",
      "importance": "high"
    }
  ],
  "missing_evidence": [
    {
      "evidence_name": "<evidence type e.g. Bank Statement>",
      "reason_relevant": "<relevance>",
      "related_allegation": "<allegation>",
      "importance": "high"
    }
  ]
}

### CRITICAL NEGATIVE CONSTRAINTS (STRICT COMPLIANCE REQUIRED)
1. You MUST NEVER recommend investigation actions, next steps, or procedures for police officers.
2. You MUST NEVER recommend arrests, interrogations, searches, seizures, or raids.
3. You MUST NEVER recommend legal action, IPC or BNS statutory sections, or FIR registration.
4. You MUST NEVER recommend prosecution strategy or direct what the Investigating Officer (IO) should do.
5. Your responsibility ends after understanding, organizing, correlating, and identifying missing evidence/facts.
6. NEVER speculate or invent facts not grounded in the complaint or evidence provided below.

### STRICT GROUNDING RULES — ZERO HALLUCINATION TOLERANCE
- ALL fields you populate MUST be derived exclusively from the COMPLAINT TEXT and EVIDENCE OCR/descriptions provided in this prompt.
- DO NOT import knowledge from other cases, training data, or general crime patterns.
- For `missing_information`: ONLY list items that are directly referenced or strongly implied by THIS complaint's text (e.g., if a UPI ID is mentioned, its full beneficiary name may be missing). Do NOT suggest items from unrelated crime types (e.g., do NOT mention motorcycles, CCTV, or locations not mentioned in this complaint).
- For `missing_evidence`: ONLY suggest evidence types that are logically implied by what THIS complaint describes (e.g., if a phone call is mentioned, call records are relevant; if no motorcycle is mentioned, do NOT suggest CCTV of a motorcycle).
- For `people_and_entities`: Extract ONLY names, numbers, IDs, locations explicitly stated in the complaint text or OCR. Do NOT invent or infer entities.
- If you are uncertain whether a fact appears in the provided text, OMIT it entirely rather than guessing.

Analyze the case context below and return the JSON object:
"""


def build_case_understanding_user_prompt(case_context_json: str) -> str:
    """Build a structured user prompt that explicitly highlights evidence IDs and content."""
    import json as _json

    try:
        ctx = _json.loads(case_context_json)
    except Exception:
        ctx = {}

    case_id = ctx.get("case_id", "UNKNOWN")
    complaint_text = ctx.get("complaint_text", "")
    metadata = ctx.get("complaint_metadata", {})
    evidence_list = ctx.get("evidence", [])

    lines = []
    lines.append(f"=== CASE ID: {case_id} ===")

    if metadata:
        lines.append("\n--- COMPLAINT METADATA ---")
        for k, v in metadata.items():
            lines.append(f"{k}: {v}")

    lines.append("\n--- COMPLAINT TEXT ---")
    lines.append(complaint_text)

    if evidence_list:
        lines.append(f"\n--- EVIDENCE ({len(evidence_list)} items) ---")
        lines.append("CRITICAL: You MUST populate evidence_analysis[] with one entry per evidence item below.")
        lines.append("CRITICAL: You MUST populate people_and_entities with ALL names, vehicles, locations, phones found.")
        for i, ev in enumerate(evidence_list):
            ev_id = ev.get("id", f"ev-{i}")
            filename = ev.get("filename", "unknown")
            ev_type = ev.get("type", "unknown")
            florence = ev.get("florence_description") or ""
            ocr = ev.get("ocr_text") or ""
            lines.append(f"\n[EVIDENCE {i+1}]")
            lines.append(f"  evidence_id : {ev_id}")
            lines.append(f"  filename    : {filename}")
            lines.append(f"  type        : {ev_type}")
            if florence:
                lines.append(f"  VISUAL DESCRIPTION (Florence-2): {florence}")
            if ocr:
                lines.append(f"  OCR TEXT EXTRACTED: {ocr}")
            if not florence and not ocr:
                lines.append("  (No visual/text content extracted)")
    else:
        lines.append("\n--- NO EVIDENCE PROVIDED ---")

    lines.append("\n=== TASK ===")
    lines.append("Analyze ONLY the complaint text and evidence items listed above. Do NOT use knowledge from other complaints or your training data.")
    lines.append("Return ONLY valid raw JSON matching the exact schema. No markdown. No explanations.")
    lines.append("ENSURE: evidence_analysis[] has one entry per evidence item using its exact evidence_id.")
    lines.append("ENSURE: people_and_entities is fully populated from complaint text and OCR text ONLY.")
    lines.append("ENSURE: missing_information contains ONLY gaps directly implied by THIS complaint's facts — no items from unrelated crime types.")
    lines.append("ENSURE: missing_evidence contains ONLY evidence types logically relevant to what THIS complaint describes.")
    lines.append("CRITICAL: If a fact (person, vehicle, location, phone number) is NOT mentioned in the text above, do NOT include it anywhere in your response.")
    lines.append("CRITICAL: For crime_analysis.estimated_financial_loss — you MUST scan the complaint text and all OCR text for any monetary amounts (₹, Rs, INR). Sum ALL debited/transferred/lost amounts and set the field to that total as a float (e.g. 185000.0). If no amount is found, set to 0.0. NEVER leave this as null or a placeholder number.")
    lines.append("CRITICAL: For people_and_entities — extract victim name from complaint text, extract phone numbers, UPI IDs (format: name@bank), bank account numbers from OCR. Populate victims[], suspects[], upi_ids[], phone_numbers[], bank_accounts[] arrays.")

    return "\n".join(lines)
