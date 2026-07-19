from app.core.logging import logger
from app.evidence.context import EvidenceContext
from app.evidence.interfaces import EvidenceProcessor

# Semantic investigation tags defined in the architecture roadmap
INVESTIGATION_TAGS = [
    "Bank Statement",
    "Aadhaar",
    "PAN",
    "Vehicle",
    "Knife",
    "Currency",
    "Passport",
    "Receipt",
    "Cheque",
    "Mobile Phone",
]


class VisionProcessor(EvidenceProcessor):
    """
    Processor responsible for visual tag generation on images using zero-shot image classification.
    Uses SigLIP (specifically google/siglip-base-patch16-224) as the primary classifier.
    Falls back to keyword-based filename matching if the ML pipeline is unavailable.
    """

    # Class-level cache for the Hugging Face Pipeline
    _classifier_pipeline = None
    _is_initialized = False

    @classmethod
    def _initialize_pipeline(cls):
        if cls._is_initialized:
            return

        try:
            logger.info("VisionProcessor: Attempting to lazily load SigLIP zero-shot classifier...")
            import importlib
            # Dynamically import packages to suppress static linter warnings for optional packages
            importlib.import_module("torch")
            transformers = importlib.import_module("transformers")
            pipeline = transformers.pipeline

            # Load the lightweight siglip-base model for CPU capability and fast inference
            cls._classifier_pipeline = pipeline(
                "zero-shot-image-classification",
                model="google/siglip-base-patch16-224",
                device="cpu",  # Default to CPU for reliability
            )
            logger.info("VisionProcessor: SigLIP classifier pipeline loaded successfully.")
        except Exception as e:
            logger.warning(
                f"VisionProcessor: Hugging Face transformers/PyTorch is unavailable: {e}. "
                "Will use keyword-based rules for image classification."
            )

        cls._is_initialized = True

    async def process(self, context: EvidenceContext) -> EvidenceContext:
        if context.file_type != "IMAGE":
            logger.info(f"VisionProcessor: Skipping file '{context.item.original_filename}' of type '{context.file_type}' (only images are classified).")
            return context

        logger.info(f"VisionProcessor: Analyzing image '{context.item.original_filename}'")
        self._initialize_pipeline()

        path = context.temp_file_path
        if not path or not path.exists():
            context.errors.append("VisionProcessor: Temporary image file path is invalid or missing.")
            return context

        try:
            if self._classifier_pipeline:
                logger.info("VisionProcessor: Performing SigLIP zero-shot classification...")
                results = self._classifier_pipeline(
                    str(path),
                    candidate_labels=INVESTIGATION_TAGS,
                    hypothesis_template="This image shows a {}.",
                )

                # Filter tags: take top prediction if score > 0.15, and any others > 0.3
                tags = []
                if results:
                    top_pred = results[0]
                    if top_pred["score"] > 0.15:
                        tags.append(top_pred["label"])
                    for pred in results[1:]:
                        if pred["score"] > 0.3:
                            tags.append(pred["label"])
                context.image_tags = tags
                logger.info(f"VisionProcessor: Classified tags: {tags}")
            else:
                logger.info("VisionProcessor: SigLIP unavailable. Running keyword-based rule fallback classification.")
                tags = self._generate_fallback_tags(context.item.original_filename)
                context.image_tags = tags
                logger.info(f"VisionProcessor: Fallback classified tags: {tags}")

        except Exception as e:
            logger.error(
                f"VisionProcessor: Classification failed: {e}",
                extra={"original_filename": context.item.original_filename},
                exc_info=True,
            )
            context.errors.append(f"VisionProcessor error: {str(e)}")

        return context

    def _generate_fallback_tags(self, filename: str) -> list[str]:
        """Maps filename keywords to semantic investigation tags."""
        fn_lower = filename.lower()
        tags = []

        if "aadhaar" in fn_lower or "aadhar" in fn_lower:
            tags.append("Aadhaar")
        elif "pan" in fn_lower:
            tags.append("PAN")
        elif "bank" in fn_lower or "statement" in fn_lower or "passbook" in fn_lower:
            tags.append("Bank Statement")
        elif "vehicle" in fn_lower or "car" in fn_lower or "bike" in fn_lower:
            tags.append("Vehicle")
        elif "knife" in fn_lower or "weapon" in fn_lower:
            tags.append("Knife")
        elif "currency" in fn_lower or "cash" in fn_lower:
            tags.append("Currency")
        elif "passport" in fn_lower:
            tags.append("Passport")
        elif "receipt" in fn_lower or "invoice" in fn_lower:
            tags.append("Receipt")
        elif "cheque" in fn_lower or "check" in fn_lower:
            tags.append("Cheque")
        elif "phone" in fn_lower or "mobile" in fn_lower:
            tags.append("Mobile Phone")
        else:
            tags.append("Receipt")  # Default placeholder tag

        return tags
