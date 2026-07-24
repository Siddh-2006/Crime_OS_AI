"""
Temporal event extractor for detecting time-related information in complaint text.
Extracts references to when incidents occurred, timelines, etc.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class TemporalEvent:
    """Represents a temporal reference in text."""
    text: str
    relative_time: str | None
    start: int
    end: int


class TemporalEventExtractor:
    """Extracts temporal events from complaint text."""
    
    TEMPORAL_KEYWORDS = [
        "today", "yesterday", "tomorrow",
        "last week", "last month", "last year",
        "next week", "next month", "next year",
        "morning", "afternoon", "evening", "night",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
    ]
    
    async def extract(self, text: str) -> list[TemporalEvent]:
        """
        Extract temporal references from text.
        
        Args:
            text: Input complaint text
            
        Returns:
            List of temporal events/references
        """
        events = []
        
        try:
            text_lower = text.lower()
            for keyword in self.TEMPORAL_KEYWORDS:
                start_idx = 0
                while True:
                    idx = text_lower.find(keyword, start_idx)
                    if idx == -1:
                        break
                    
                    events.append(
                        TemporalEvent(
                            text=text[idx:idx+len(keyword)],
                            relative_time=keyword,
                            start=idx,
                            end=idx+len(keyword)
                        )
                    )
                    start_idx = idx + 1
        except Exception:
            pass
        
        return events
