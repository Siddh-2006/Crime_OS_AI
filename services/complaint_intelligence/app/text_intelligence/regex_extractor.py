"""
Regex-based extractor for Indian-specific patterns.
Extracts phone numbers, addresses, vehicle numbers, FIR references, etc.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class RegexMatch:
    """Represents a regex pattern match."""
    pattern_name: str
    text: str
    start: int
    end: int


class IndianRegexExtractor:
    """Extracts Indian-specific patterns from text using regex."""
    
    PATTERNS = {
        "phone": r"\b(?:\+91[-.\s]?)?(?:[6-9]\d{9}|\d{10})\b",
        "aadhar": r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
        "pan": r"\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b",
        "vehicle": r"\b[A-Z]{2}[-]?[0-9]{2}[-]?[A-Z]{2}[-]?[0-9]{4}\b",
        "fir": r"\b(?:FIR|fir)[-\s]?(?:No\.?[-\s]?)?([0-9]{1,5})\b",
        "date": r"\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b",
    }
    
    async def extract(self, text: str) -> list[RegexMatch]:
        """
        Extract Indian-specific patterns from text.
        
        Args:
            text: Input complaint text
            
        Returns:
            List of matched patterns
        """
        matches = []
        
        try:
            for pattern_name, pattern in self.PATTERNS.items():
                for match in re.finditer(pattern, text):
                    matches.append(
                        RegexMatch(
                            pattern_name=pattern_name,
                            text=match.group(),
                            start=match.start(),
                            end=match.end()
                        )
                    )
        except Exception:
            pass
        
        return matches
