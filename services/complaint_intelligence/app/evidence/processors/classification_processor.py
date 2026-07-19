from app.core.logging import logger
from app.evidence.context import EvidenceContext
from app.evidence.interfaces import EvidenceProcessor


class ClassificationProcessor(EvidenceProcessor):
    """
    Processor responsible for categorizing the evidence item into standard investigation formats
    (Identity Document, Financial Document, Vehicle, Chat Screenshot, Medical Record, Official Letter, Crime Scene, or Unknown)
    using rule-based keyword scoring across OCR text, SigLIP image tags, and original filenames.
    """

    async def process(self, context: EvidenceContext) -> EvidenceContext:
        logger.info(f"ClassificationProcessor: Classifying evidence '{context.item.original_filename}'")
        try:
            category, confidence = self._classify_evidence(context)
            context.classification = category
            context.classification_confidence = confidence
            logger.info(f"ClassificationProcessor: Determined category '{category}' with confidence {confidence}")
        except Exception as e:
            logger.error(
                f"ClassificationProcessor: Error classifying file: {e}",
                extra={"original_filename": context.item.original_filename},
                exc_info=True,
            )
            context.classification = "Unknown"
            context.classification_confidence = 0.5
            context.errors.append(f"ClassificationProcessor error: {str(e)}")

        return context

    def _classify_evidence(self, context: EvidenceContext) -> tuple[str, float]:
        filename = (context.item.original_filename or "").lower()
        ocr_text = (context.ocr_text or "").lower()
        tags = [t.lower() for t in context.image_tags]

        # 1. Identity Document checks
        identity_tags = {"aadhaar", "pan", "passport"}
        if any(t in identity_tags for t in tags):
            return "Identity Document", 0.95

        identity_keywords = [
            "unique identification",
            "government of india",
            "permanent account number",
            "income tax department",
            "passport",
            "identity card",
            "national id",
            "aadhaar card",
            "pan card",
        ]
        identity_hits = sum(1 for kw in identity_keywords if kw in ocr_text)
        if identity_hits >= 2 or any(kw in filename for kw in ["aadhaar", "aadhar", "pan", "passport"]):
            return "Identity Document", 0.85
        if identity_hits == 1:
            return "Identity Document", 0.70

        # 2. Financial Document checks
        financial_tags = {"bank statement", "cheque", "receipt"}
        if any(t in financial_tags for t in tags):
            return "Financial Document", 0.95

        financial_keywords = [
            "ifs code",
            "account number",
            "cheque",
            "debit",
            "credit",
            "balance",
            "transaction",
            "invoice",
            "receipt",
            "bill",
            "total amount",
            "tax invoice",
            "bank statement",
            "passbook",
        ]
        financial_hits = sum(1 for kw in financial_keywords if kw in ocr_text)
        if financial_hits >= 2 or any(kw in filename for kw in ["bank", "statement", "passbook", "cheque", "receipt", "invoice", "bill"]):
            return "Financial Document", 0.85
        if financial_hits == 1:
            return "Financial Document", 0.70

        # 3. Vehicle checks
        if "vehicle" in tags:
            return "Vehicle", 0.95

        vehicle_keywords = [
            "registration certificate",
            "chassis no",
            "engine no",
            "vehicle class",
            "transport department",
            "owner name",
        ]
        vehicle_hits = sum(1 for kw in vehicle_keywords if kw in ocr_text)
        if vehicle_hits >= 2 or any(kw in filename for kw in ["vehicle", "car", "bike", "registration", "rc"]):
            return "Vehicle", 0.85
        if vehicle_hits == 1:
            return "Vehicle", 0.70

        # 4. Chat Screenshot checks
        chat_keywords = [
            "whatsapp",
            "chat log",
            "screenshot",
            "message chat",
            "conversation",
            "delivered",
            "unread",
        ]
        chat_hits = sum(1 for kw in chat_keywords if kw in ocr_text)
        if chat_hits >= 2 or any(kw in filename for kw in ["chat", "screenshot", "whatsapp", "messages"]):
            return "Chat Screenshot", 0.85
        if chat_hits == 1:
            return "Chat Screenshot", 0.70

        # 5. Medical Record checks
        medical_keywords = [
            "medical report",
            "hospital",
            "doctor",
            "prescription",
            "clinical",
            "patient",
            "diagnosis",
            "treatment",
        ]
        medical_hits = sum(1 for kw in medical_keywords if kw in ocr_text)
        if medical_hits >= 2 or any(kw in filename for kw in ["medical", "report", "prescription", "hospital", "health"]):
            return "Medical Record", 0.85
        if medical_hits == 1:
            return "Medical Record", 0.70

        # 6. Official Letter checks
        letter_keywords = [
            "respected sir",
            "dear sir",
            "sub:",
            "official letter",
            "police station",
            "subject:",
            "complaint letter",
        ]
        letter_hits = sum(1 for kw in letter_keywords if kw in ocr_text)
        if letter_hits >= 2 or any(kw in filename for kw in ["letter", "complaint", "request"]):
            return "Official Letter", 0.85
        if letter_hits == 1:
            return "Official Letter", 0.70

        # 7. Crime Scene checks
        crime_scene_tags = {"knife", "currency"}
        if any(t in crime_scene_tags for t in tags):
            return "Crime Scene", 0.95

        if any(kw in filename for kw in ["crime", "scene", "knife", "weapon", "blood", "murder", "theft"]):
            return "Crime Scene", 0.75

        # 8. Unknown fallback
        return "Unknown", 0.50
