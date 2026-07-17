import unittest


from ingestion.utils import (
    extract_chapter_tags,
    extract_legal_clause_id,
    extract_legal_chapter,
    extract_legal_section_serial,
    extract_legal_subsection_id,
    extract_references,
    extract_section_candidate,
    extract_semantic_heading,
    extract_subpart_candidate,
    is_legal_noise_line,
    normalize_text,
)


class UtilsTests(unittest.TestCase):
    def test_extract_section_candidate_handles_number_and_title(self):
        section, title = extract_section_candidate("318 Cheating")
        self.assertEqual(section, "318")
        self.assertEqual(title, "Cheating")

    def test_extract_semantic_heading_detects_numeric_levels(self):
        level, title, label = extract_semantic_heading("1.2 Investigation Steps")
        self.assertEqual(level, 2)
        self.assertEqual(title, "Investigation Steps")
        self.assertEqual(label, "1.2")

    def test_extract_subpart_candidate_handles_alpha_bullets(self):
        label, content = extract_subpart_candidate("(a) if the consent is under fear of injury")
        self.assertEqual(label, "a")
        self.assertEqual(content, "if the consent is under fear of injury")

    def test_extract_references_picks_section_mentions(self):
        refs = extract_references("The exceptions in sections 25, 26 and 27 do not extend.")
        self.assertEqual(refs, ["25", "26", "27"])

    def test_extract_references_ignores_subsection_markers(self):
        refs = extract_references("sections 25, 26 and 27; sub-sections (2), (3), (4) of section 309")
        self.assertEqual(refs, ["25", "26", "27", "309"])

    def test_extract_legal_markers_use_text_only_rules(self):
        self.assertEqual(extract_legal_chapter("CHAPTER X"), "CHAPTER X")
        self.assertEqual(extract_legal_section_serial("28. A consent is not such a consent."), "28")
        self.assertEqual(extract_legal_subsection_id("(1)"), "(1)")
        self.assertEqual(extract_legal_clause_id("(a) if the consent is under fear of injury"), "(a)")

    def test_extract_chapter_tags_splits_comma_separated_text(self):
        tags = extract_chapter_tags(["OFFENCES RELATING TO COIN, CURRENCY-NOTES, BANK-NOTES,", "AND GOVERNMENT STAMPS"])
        self.assertEqual(
            tags,
            ["OFFENCES RELATING TO COIN", "CURRENCY-NOTES", "BANK-NOTES", "AND GOVERNMENT STAMPS"],
        )

    def test_legal_noise_filter_removes_pdf_headers(self):
        self.assertTrue(is_legal_noise_line("THE GAZETTE OF INDIA EXTRAORDINARY"))
        self.assertTrue(is_legal_noise_line("REGISTERED NO. D. L.-33004/99"))
        self.assertTrue(is_legal_noise_line("_____"))
        self.assertFalse(is_legal_noise_line("CHAPTER X"))

    def test_normalize_text_collapses_spaces(self):
        self.assertEqual(normalize_text("  hello   world  "), "hello world")


if __name__ == "__main__":
    unittest.main()
