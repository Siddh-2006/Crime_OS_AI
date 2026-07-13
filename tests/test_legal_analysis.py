import unittest

from ingestion.schemas import LegalSectionRecord
from legal_rag.analysis import build_analysis_result, compute_confidence
from legal_rag.models import LegalRetrievalBundle, LegalRetrievalResult
from llm.qwen_client import QwenClient


class FakeBackend:
    def __init__(self, response: str) -> None:
        self.response = response

    def generate(self, prompt: str, *, max_new_tokens: int = 1024, temperature: float = 0.2, top_p: float = 0.9) -> str:
        return self.response


class LegalAnalysisTests(unittest.TestCase):
    def _make_record(self, act: str, serial: str, chapter: str = "CHAPTER X") -> LegalSectionRecord:
        return LegalSectionRecord(act=act, serial_number=serial, chapter=chapter, content=f"Content for {serial}")

    def test_confidence_uses_retrieval_signals(self):
        bundle = LegalRetrievalBundle(
            complaint="Fake UPI complaint",
            top_5=[
                LegalRetrievalResult(record=self._make_record("BNS", "318"), retrieval_score=0.92, rerank_score=0.97),
                LegalRetrievalResult(record=self._make_record("BNS", "319"), retrieval_score=0.80, rerank_score=0.72),
                LegalRetrievalResult(record=self._make_record("BNS", "320"), retrieval_score=0.76, rerank_score=0.68),
            ],
        )
        confidence = compute_confidence(bundle)
        self.assertEqual(confidence.level, "HIGH")
        self.assertGreaterEqual(confidence.score, 0.76)

    def test_analysis_filters_unsupported_reasoning_claims(self):
        bundle = LegalRetrievalBundle(
            complaint="Victim lost money through fake UPI collect request",
            top_5=[
                LegalRetrievalResult(record=self._make_record("BNS", "318"), retrieval_score=0.91, rerank_score=0.95),
            ],
            context_sections=[
                LegalRetrievalResult(
                    record=self._make_record("BNS", "25"),
                    retrieval_score=0.0,
                    rerank_score=0.0,
                    context_type="referenced_section",
                )
            ],
        )
        raw_response = """
        {
          "query": "Victim lost money through fake UPI collect request",
          "applicable_sections": [{"act": "BNS", "section": "318", "relevance_score": 0.91}],
          "explanation": [{
            "section": "BNS_318",
            "matched_elements": [{"legal_element": "deception", "complaint_fact": "accused impersonated a bank employee"}]
          }],
          "reasoning": [
            {"claim": "Deception appears present.", "citations": ["BNS_318"]},
            {"claim": "Unsupported claim", "citations": []},
            {"claim": "Referenced law matters.", "citations": ["BNS_25", "BNS_999"]}
          ],
          "supporting_sections": [{"section": "BNS_25", "context_type": "referenced_section"}]
        }
        """
        analysis = build_analysis_result(bundle, QwenClient(backend=FakeBackend(raw_response)).generate_structured_analysis(
            complaint=bundle.complaint,
            sections="dummy",
        ))
        self.assertEqual(analysis.query, bundle.complaint)
        self.assertEqual(len(analysis.reasoning), 2)
        self.assertEqual(analysis.reasoning[0].citations, ["BNS_318"])
        self.assertEqual(analysis.reasoning[1].citations, ["BNS_25"])
        self.assertEqual(analysis.supporting_sections[0].section, "BNS_25")
        self.assertEqual(analysis.applicable_sections[0].section, "318")

    def test_low_confidence_adds_review_note(self):
        bundle = LegalRetrievalBundle(complaint="Unknown complaint")
        analysis = build_analysis_result(bundle, {"query": "Unknown complaint", "applicable_sections": [], "explanation": [], "reasoning": [], "supporting_sections": []})
        self.assertEqual(analysis.confidence.level, "LOW")
        self.assertEqual(analysis.review_note, "Manual legal review recommended.")


if __name__ == "__main__":
    unittest.main()
