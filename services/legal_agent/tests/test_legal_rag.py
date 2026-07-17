import unittest
import json

from ingestion.schemas import LegalSectionRecord
from legal_rag.embedding import build_legal_embedding_text
from legal_rag.models import EmbeddedLegalRecord, LegalRetrievalBundle, LegalRetrievalResult
from legal_rag.qdrant_store import LegalQdrantStore
from llm.qwen_client import QwenClient


class LegalRagTests(unittest.TestCase):
    def test_embedding_text_includes_chapter_signals(self):
        record = LegalSectionRecord(
            act="BNS",
            chapter="CHAPTER X",
            chapter_tag=["OFFENCES RELATING TO COIN", "CURRENCY-NOTES"],
            serial_number="318",
            content="Fake note offence content",
        )
        text = build_legal_embedding_text(record)
        self.assertIn("ACT:\nBNS", text)
        self.assertIn("CHAPTER:\nCHAPTER X", text)
        self.assertIn("CHAPTER TAGS:\nOFFENCES RELATING TO COIN, CURRENCY-NOTES", text)
        self.assertIn("SECTION:\n318", text)

    def test_prompt_sections_text_marks_context_type(self):
        record = LegalSectionRecord(act="BNS", serial_number="318", chapter="CHAPTER X", content="Fake note offence content")
        bundle = LegalRetrievalBundle(
            complaint="Complaint text",
            top_5=[LegalRetrievalResult(record=record, rerank_score=0.75)],
            context_sections=[LegalRetrievalResult(record=record, context_type="referenced_section")],
        )
        text = bundle.prompt_sections_text()
        self.assertIn("Context Type: retrieved_section", text)
        self.assertIn("Context Type: referenced_section", text)

    def test_qwen_prompt_is_strict_and_grounded(self):
        prompt = QwenClient.build_prompt("Victim lost ₹50,000 through a fake UPI collect request.", "Section block")
        self.assertIn("You may ONLY use the supplied legal provisions.", prompt)
        self.assertIn("Return only valid JSON", prompt)
        self.assertIn("Complaint:", prompt)

    def test_qdrant_search_prefers_query_points(self):
        class FakeHit:
            def __init__(self) -> None:
                self.payload = {"act": "BNS", "serial_number": "318", "content": "text"}
                self.score = 0.91

        class FakeResponse:
            def __init__(self) -> None:
                self.points = [FakeHit()]

        class FakeClient:
            def __init__(self) -> None:
                self.called = None

            def query_points(self, **kwargs):
                self.called = kwargs
                return FakeResponse()

        store = LegalQdrantStore.__new__(LegalQdrantStore)
        store.config = type("Config", (), {"collection_name": "legal"})()
        store._client = FakeClient()
        store._models = None

        results = store.search([0.1, 0.2, 0.3], limit=5)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].serial_number, "318")
        self.assertIn("query", store.client.called)
        self.assertNotIn("query_vector", store.client.called)

    def test_embedded_record_json_is_serializable(self):
        record = LegalSectionRecord(act="BNS", serial_number="318", content="text")
        embedded = EmbeddedLegalRecord(record=record, embedding_text="ACT:\nBNS", embedding=[0.1, 0.2])
        payload = embedded.to_json_dict()
        json.dumps(payload)


if __name__ == "__main__":
    unittest.main()
