from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .extract_text import PageExtraction
from .parse_bns import parse_legal_act_pages
from .schemas import LegalSectionRecord


def parse_bnss_pdf(
    pdf_path: str | Path,
    pages: Iterable[PageExtraction],
    *,
    output_dir: str | Path | None = None,
) -> list[LegalSectionRecord] | Path:
    return parse_legal_act_pages(pdf_path, pages, act="BNSS", parser_name="parse_bnss", output_dir=output_dir)
