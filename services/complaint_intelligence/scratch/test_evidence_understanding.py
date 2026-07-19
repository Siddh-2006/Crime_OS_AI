import asyncio
import os
import sys
import tempfile
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.absolute()))

from PIL import Image
import fitz  # PyMuPDF

from app.schemas.complaint import ComplaintAnalyzeRequest, EvidenceItem
from app.services.orchestrator import ComplaintIntelligenceOrchestrator


def create_test_image(path: Path) -> None:
    """Creates a simple 100x200 red image with custom EXIF tags."""
    img = Image.new("RGB", (100, 200), color="red")
    
    # We can write EXIF metadata using the PIL Exif class
    exif = img.getexif()
    # 271 is Make, 272 is Model, 305 is Software
    exif[271] = "AntigravityTestMake"
    exif[272] = "AntigravityTestModel"
    exif[305] = "AntigravityOS"
    
    # Save image with exif
    img.save(path, exif=exif)
    print(f"Created test image at {path}")


def create_test_pdf(path: Path) -> None:
    """Creates a simple PDF document with 2 pages and custom metadata."""
    doc = fitz.open()
    
    # Page 1: 300 x 400
    page1 = doc.new_page(width=300, height=400)
    page1.insert_text((50, 50), "This is Page 1 of the bank statement details.")
    
    # Page 2: 500 x 600
    page2 = doc.new_page(width=500, height=600)
    page2.insert_text((50, 50), "This is Page 2 of the bank statement details.")
    
    # Set metadata
    doc.set_metadata({
        "title": "Antigravity Report",
        "author": "Officer Antigravity",
        "subject": "Case Evidence Analysis",
    })
    
    doc.save(str(path))
    doc.close()
    print(f"Created test PDF at {path}")


async def test_pipeline():
    print("Initializing test_pipeline...")
    
    # Define temporary file paths with keywords to trigger OCR & Tag classification
    temp_dir = Path(tempfile.gettempdir())
    test_img_path = temp_dir / "aadhaar_card.jpg"
    test_pdf_path = temp_dir / "bank_statement.pdf"
    
    try:
        # 1. Create real test files
        create_test_image(test_img_path)
        create_test_pdf(test_pdf_path)
        
        # 2. Setup incoming evidence items pointing to local test files
        evidence_items = [
            EvidenceItem(
                publicId="img_123",
                secureUrl=test_img_path.as_uri(),  # Use file:// URI
                resourceType="image",
                mimeType="image/jpeg",
                originalFilename="aadhaar_card.jpg",
                extension=".jpg",
                size=os.path.getsize(test_img_path)
            ),
            EvidenceItem(
                publicId="pdf_456",
                secureUrl=test_pdf_path.as_uri(),  # Use file:// URI
                resourceType="raw",
                mimeType="application/pdf",
                originalFilename="bank_statement.pdf",
                extension=".pdf",
                size=os.path.getsize(test_pdf_path)
            )
        ]
        
        # 3. Create mock ComplaintAnalyzeRequest
        request = ComplaintAnalyzeRequest(
            complaintId="complaint_987",
            detailedDescription="A cyber crime complaint with attached photo and PDF document.",
            shortDescription="Cyber Crime",
            evidence=evidence_items
        )
        
        # 4. Instantiate Orchestrator and run pipeline
        orchestrator = ComplaintIntelligenceOrchestrator()
        print("Running pipeline...")
        response = await orchestrator.run_pipeline(request)
        
        # 5. Assertions and prints
        print("\n=== PIPELINE RESPONSE ===")
        print(f"Message: {response.message}")
        print(f"Detected Language: {response.preprocessed.detected_language}")
        
        print("\n--- Evidence Items Processed: ---")
        assert len(response.evidence) == 2, f"Expected 2 processed evidence items, got {len(response.evidence)}"
        
        for idx, evidence in enumerate(response.evidence):
            print(f"\nItem {idx + 1}: {evidence.original_filename}")
            print(f"  Public ID: {evidence.public_id}")
            print(f"  Status: {evidence.processing_status}")
            print(f"  File Type: {evidence.metadata.file_type}")
            print(f"  File Size: {evidence.metadata.file_size} bytes")
            print(f"  Dimensions: {evidence.metadata.width}x{evidence.metadata.height}")
            print(f"  EXIF Metadata Keys: {list(evidence.metadata.exif.keys())}")
            print(f"  AI OCR Text (First 100 chars): {repr(evidence.ai_metadata.ocr_text[:100] if evidence.ai_metadata.ocr_text else '')}")
            print(f"  AI OCR Confidence: {evidence.ai_metadata.ocr_confidence}")
            print(f"  AI Image Tags: {evidence.ai_metadata.image_tags}")
            print(f"  Classification: {evidence.classification}")
            print(f"  Classification Confidence: {evidence.classification_confidence}")
            
            # Assertions
            assert evidence.processing_status == "PROCESSED"
            if evidence.metadata.file_type == "IMAGE":
                assert evidence.metadata.width == 100
                assert evidence.metadata.height == 200
                assert "Make" in evidence.metadata.exif
                assert evidence.metadata.exif["Make"] == "AntigravityTestMake"
                # OCR extraction tests
                assert "Aadhaar" in evidence.ai_metadata.ocr_text
                # Visual tagging tests
                assert "Aadhaar" in evidence.ai_metadata.image_tags
                # Classification tests
                assert evidence.classification == "Identity Document"
                assert evidence.classification_confidence >= 0.85
            elif evidence.metadata.file_type == "PDF":
                assert evidence.metadata.width == 300
                assert evidence.metadata.height == 400
                assert "title" in evidence.metadata.exif
                assert evidence.metadata.exif["title"] == "Antigravity Report"
                # OCR extraction tests (PyMuPDF digital text extraction check)
                assert "Page 1 of the bank statement" in evidence.ai_metadata.ocr_text
                assert "Page 2 of the bank statement" in evidence.ai_metadata.ocr_text
                assert evidence.ai_metadata.ocr_confidence == 1.0
                # Visual classification tests (PDF shouldn't run image tags)
                assert len(evidence.ai_metadata.image_tags) == 0
                # Classification tests
                assert evidence.classification == "Financial Document"
                assert evidence.classification_confidence >= 0.85
                
        print("\nAll pipeline assertions PASSED successfully!")
        
    finally:
        # Clean up temporary test files
        if test_img_path.exists():
            test_img_path.unlink()
        if test_pdf_path.exists():
            test_pdf_path.unlink()
        print("Temporary test files cleaned up.")


if __name__ == "__main__":
    asyncio.run(test_pipeline())
