from __future__ import annotations

import argparse
import logging
from pathlib import Path

from extractors.paddle_ocr_extractor import extract_pdf_pages, iter_pdf_pages
from ingestion.parse_bsa import parse_bsa_pdf
from ingestion.parse_bnss import parse_bnss_pdf
from ingestion.parse_bns import parse_bns_pdf


LOGGER = logging.getLogger(__name__)


def _dispatch_parser(path: Path):
    name = path.stem.lower()
    if "bns" in name and "bnss" not in name:
        return parse_bns_pdf
    if "bnss" in name:
        return parse_bnss_pdf
    if "bsa" in name:
        return parse_bsa_pdf
    raise ValueError(f"Could not infer parser from filename: {path.name}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse legal PDFs into JSON-ready records.")
    parser.add_argument("pdf", type=Path, help="Path to a PDF file")
    parser.add_argument("--out", type=Path, default=Path("parsed"), help="Output directory")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    parser_fn = _dispatch_parser(args.pdf)
    LOGGER.info("Starting extraction for %s", args.pdf)
    args.out.mkdir(parents=True, exist_ok=True)
    if parser_fn in (parse_bns_pdf, parse_bnss_pdf, parse_bsa_pdf):
        LOGGER.info("Parsing OCR pages into structured records with streaming output")
        output_path = parser_fn(args.pdf, pages=iter_pdf_pages(args.pdf), output_dir=args.out)
        LOGGER.info("Finished writing %s", output_path)
        print(f"Wrote parsed JSON to {output_path}")
    else:
        pages = extract_pdf_pages(args.pdf)
        LOGGER.info("OCR extraction complete: %s pages", len(pages))
        LOGGER.info("Parsing pages into structured records")
        records = parser_fn(args.pdf, pages=pages)
        output_path = args.out / f"{args.pdf.stem}.json"
        LOGGER.info("Writing %s records to %s", len(records), output_path)
        output_path.write_text(
            "[" + ",\n".join(record.model_dump_json(indent=2) if hasattr(record, "model_dump_json") else record.json(indent=2) for record in records) + "]",
            encoding="utf-8",
        )
        LOGGER.info("Finished writing %s", output_path)
        print(f"Wrote {len(records)} records to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
