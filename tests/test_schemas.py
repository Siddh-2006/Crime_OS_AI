import unittest
from ingestion.schemas import ClauseRecord, LegalSectionRecord, SOPRecord, SubsectionRecord
class SchemaTests(unittest.TestCase):
    def test_legal_record_dump_works_without_pydantic(self):
        record = LegalSectionRecord(
            act="BNS",
            serial_number="318",
            chapter="CHAPTER X",
            chapter_tag=["OFFENCES"],
            content="text",
            references=["12", "13"],
            clauses=[ClauseRecord(id="(a)", content="text", references=["5"], page=1, source_page=1, source_pages=[1])],
            subsections=[
                SubsectionRecord(
                    id="(1)",
                    content="text",
                    references=[],
                    page=1,
                    source_page=1,
                    source_pages=[1],
                    clauses=[],
                )
            ],
            page=1,
            source_page=1,
        )
        dumped = record.model_dump(exclude_none=True)
        self.assertEqual(dumped["act"], "BNS")
        self.assertEqual(dumped["serial_number"], "318")
        self.assertEqual(dumped["references"], ["12", "13"])
        self.assertEqual(dumped["chapter"], "CHAPTER X")
        self.assertEqual(dumped["chapter_tag"], ["OFFENCES"])
        self.assertEqual(dumped["page"], 1)

    def test_sop_record_dump_works_without_pydantic(self):
        record = SOPRecord(document="NCRP_SOP", chapter="UPI Fraud Investigation", content="text", source_page=53)
        dumped = record.model_dump(exclude_none=True)
        self.assertEqual(dumped["act"], "NCRP")
        self.assertEqual(dumped["chapter"], "UPI Fraud Investigation")


if __name__ == "__main__":
    unittest.main()
