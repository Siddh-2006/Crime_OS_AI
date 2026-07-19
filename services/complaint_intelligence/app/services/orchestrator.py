from app.schemas.complaint import ComplaintAnalyzeRequest
from app.schemas.analysis import ComplaintAnalyzeResponse, PreprocessedData
from app.services.preprocessor import ComplaintPreprocessor
from app.evidence.services.evidence_intelligence_engine import EvidenceIntelligenceEngine
from app.core.logging import logger


class ComplaintIntelligenceOrchestrator:
    """
    Pipeline orchestrator that coordinates the execution of the Complaint Intelligence phases:
    1. Preprocessing
    2. Evidence Understanding (OCR + SigLIP + Metadata)
    3. Entity Extraction (Regex + spaCy)
    4. Evidence Fusion
    5. Qwen LLM Reasoning
    6. Correlation Engine
    7. Recommendation Engine
    8. Timeline Generation
    9. Building & returning the final integrated Intelligence payload
    """

    def __init__(self):
        self.preprocessor = ComplaintPreprocessor()
        self.evidence_engine = EvidenceIntelligenceEngine()

    async def run_pipeline(self, request: ComplaintAnalyzeRequest) -> ComplaintAnalyzeResponse:
        """
        Executes the analysis pipeline on the given complaint.
        In Phase 2, this cleans, normalizes, detects language, and performs translation hooks on the text.
        In Phase 3A, this downloads the attached evidence, extracts size, width/height, EXIF, and GPS.
        """
        logger.info(
            "Complaint Intelligence pipeline initialized.",
            extra={"complaint_id": request.complaint_id}
        )

        # Phase 2: Preprocessing
        preprocessed_result = self.preprocessor.preprocess(request.detailed_description)

        preprocessed_data = PreprocessedData(
            original_text=preprocessed_result["original_text"],
            cleaned_text=preprocessed_result["cleaned_text"],
            detected_language=preprocessed_result["detected_language"],
            translated_text=preprocessed_result["translated_text"],
            normalized_text=preprocessed_result["normalized_text"]
        )

        # Phase 3A: Evidence Intelligence Foundation
        processed_evidence = await self.evidence_engine.process_evidence_list(request.evidence)

        return ComplaintAnalyzeResponse(
            message="Complaint Preprocessing and Evidence Processing complete.",
            preprocessed=preprocessed_data,
            evidence=processed_evidence
        )


