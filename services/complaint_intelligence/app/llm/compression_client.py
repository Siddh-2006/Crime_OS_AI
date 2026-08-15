import httpx
import re
from typing import List, Optional
from app.core.logging import logger

PROMPT_COMPRESSION_ENABLED = True
PROMPT_COMPRESSION_URL = "http://localhost:8005/compress"
TIMEOUT_SECONDS = 60.0

class PromptCompressionClient:
    def __init__(self, base_url: str = PROMPT_COMPRESSION_URL, enabled: bool = PROMPT_COMPRESSION_ENABLED):
        self.base_url = base_url
        self.enabled = enabled
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT_SECONDS))

    async def compress(self, text: str, force_tokens: Optional[List[str]] = None, rate: float = 0.5) -> str:
        if not self.enabled:
            return text

        if not text or not text.strip():
            return text

        try:
            payload = {
                "text": text,
                "rate": rate,
                "force_tokens": force_tokens or []
            }
            response = await self._client.post(self.base_url, json=payload)
            response.raise_for_status()
            data = response.json()
            return data.get("compressed_text", text)
        except Exception as e:
            logger.warning(f"prompt_compression call failed, falling back to uncompressed text. Error: {e}")
            return text

    def extract_force_tokens(self, text: str, extra_tokens: Optional[List[str]] = None) -> List[str]:
        tokens = set(extra_tokens or [])
        
        # Extract dates (YYYY-MM-DD)
        dates = re.findall(r'\b\d{4}-\d{2}-\d{2}\b', text)
        tokens.update(dates)
        
        # Extract phones (+91-XXX or 10 digits)
        phones = re.findall(r'(?:\+\d{1,3}-?)?\d{10}\b', text)
        tokens.update(phones)
        
        return list(tokens)
