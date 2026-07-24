"""
Named Entity Recognition (NER) extractor using Spacy.
Extracts entities like PERSON, ORG, GPE, etc. from complaint text.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Entity:
    """Represents a recognized entity."""
    text: str
    label: str
    start: int
    end: int


class SpacyNERExtractor:
    """Extracts named entities using Spacy."""
    
    def __init__(self, model: str = "en_core_web_sm"):
        """Initialize Spacy NER extractor."""
        self.model_name = model
        self.nlp = None
        self._load_model()
    
    def _load_model(self) -> None:
        """Load Spacy model."""
        try:
            import spacy
            self.nlp = spacy.load(self.model_name)
        except OSError:
            # Model not installed, will use fallback
            self.nlp = None
    
    async def extract(self, text: str) -> list[Entity]:
        """
        Extract named entities from text.
        
        Args:
            text: Input complaint text
            
        Returns:
            List of recognized entities
        """
        if not self.nlp:
            return []
        
        try:
            doc = self.nlp(text)
            entities = [
                Entity(
                    text=ent.text,
                    label=ent.label_,
                    start=ent.start_char,
                    end=ent.end_char
                )
                for ent in doc.ents
            ]
            return entities
        except Exception:
            return []
