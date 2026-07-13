import unittest
import sys
from pathlib import Path
parent_path = Path(__file__).resolve().parent.parent
sys.path.append(str(parent_path))

from ingestion.extract_text import PageExtraction, TextLine
from ingestion.parse_bsa import parse_bsa_pdf
from ingestion.parse_bnss import parse_bnss_pdf
from ingestion.parse_bns import parse_bns_pdf
from ingestion.parse_sop import parse_sop_pdf


def make_page(page_number: int, texts: list[str]) -> PageExtraction:
    return PageExtraction(
        page_number=page_number,
        lines=tuple(TextLine(text=text, page_number=page_number, line_index=index) for index, text in enumerate(texts)),
        raw_text="\n".join(texts),
    )


class ParserTests(unittest.TestCase):
    def test_legal_parser_groups_section_lines(self):
        pages = [
            make_page(
                1,
                [
                    "CHAPTER X",
                    "OFFENCES RELATING TO COIN, CURRENCY-NOTES, BANK-NOTES, AND GOVERNMENT STAMPS",
                    "28. A consent is not such a consent as is intended by any section of this Sanhita,",
                    "(1)",
                    "(a) if the consent is given by a person under fear of injury, or under a misconception of fact.",
                    "(b) if the consent is given by a person who is unable to understand the nature and consequence of that to which he gives consent.",
                    "(2)",
                    "(a) unless the contrary appears from the context, if the consent is given by a person under twelve years of age.",
                    "29. The exceptions in sections 25, 26 and 27 do not extend to acts.",
                    "Illustration.",
                    "The exceptions in sections 25, 26 and 27 do not extend to acts independently of any harm.",
                ],
            ),
        ]
        records = parse_bns_pdf("sample_bns.pdf", pages)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0].serial_number, "28")
        self.assertEqual(records[0].chapter, "CHAPTER X")
        self.assertEqual(
            records[0].chapter_tag,
            ["OFFENCES RELATING TO COIN", "CURRENCY-NOTES", "BANK-NOTES", "AND GOVERNMENT STAMPS"],
        )
        self.assertEqual(records[1].chapter, "CHAPTER X")
        self.assertEqual(
            records[1].chapter_tag,
            ["OFFENCES RELATING TO COIN", "CURRENCY-NOTES", "BANK-NOTES", "AND GOVERNMENT STAMPS"],
        )
        self.assertEqual(len(records[0].subsections), 2)
        self.assertEqual(records[0].subsections[0].id, "(1)")
        self.assertEqual(len(records[0].subsections[0].clauses), 2)
        self.assertEqual(records[0].subsections[0].clauses[0].id, "(a)")
        self.assertEqual(records[0].subsections[0].clauses[0].references, [])
        self.assertEqual(records[1].serial_number, "29")
        self.assertEqual(records[1].references, ["25", "26", "27"])
        self.assertEqual(records[0].source_page, 1)
        self.assertIn(1, records[0].source_pages)
        self.assertEqual(records[0].page, 1)

    def test_legal_parser_supports_direct_clauses_without_subsections(self):
        pages = [
            make_page(
                1,
                [
                    "CHAPTER I",
                    "PRELIMINARY",
                    "30. Nothing is an offence by reason of any harm which it may cause to a person.",
                    "(a) the intentional causing of death, or the attempting to cause death;",
                    "(b) the doing of anything which is done in contravention of sections 10 and 11.",
                ],
            ),
        ]
        records = parse_bns_pdf("sample_bns.pdf", pages)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].subsections, [])
        self.assertEqual(len(records[0].clauses), 2)
        self.assertEqual(records[0].clauses[1].references, ["10", "11"])
        self.assertEqual(records[0].references, ["10", "11"])

    def test_bnss_and_bsa_use_the_same_legal_parser_shape(self):
        pages = [make_page(1, ["CHAPTER I", "GENERAL", "1. Short title and commencement."])]
        bnss_records = parse_bnss_pdf("sample_bnss.pdf", pages)
        bsa_records = parse_bsa_pdf("sample_bsa.pdf", pages)
        self.assertEqual(bnss_records[0].act, "BNSS")
        self.assertEqual(bsa_records[0].act, "BSA")

    def test_sop_parser_keeps_hierarchy(self):
        pages = [
            make_page(1, ["Chapter 1 Introduction", "Scope of the manual", "1. UPI Fraud Investigation", "General guidance"]),
            make_page(2, ["1.1 Account Freezing", "Freeze requests and liaison steps"]),
        ]
        records = parse_sop_pdf("ncrp.pdf", pages)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0].act, "NCRP")
        self.assertEqual(records[0].chapter, "Introduction")
        self.assertEqual(records[1].section, "UPI Fraud Investigation")
        self.assertEqual(records[1].subsection, "Account Freezing")


if __name__ == "__main__":
    unittest.main()
