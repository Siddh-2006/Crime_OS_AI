"""
compressor.py — LLMLingua-2 wrapper with lazy-loaded, lru_cache-cached model.

Model: microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank
  - Small BERT-based model (~110 MB), runs efficiently on CPU.
  - NOT the 7B LLaMA version — fast and cheap.
"""
from __future__ import annotations

import logging
import sys
from functools import lru_cache
from typing import List, Optional

logger = logging.getLogger("prompt-compression")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
logger.propagate = False

MODEL_NAME = "microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank"


@lru_cache(maxsize=1)
def get_compressor():
    """
    Lazy-load and cache the PromptCompressor instance.
    Called once on the first request; subsequent calls return the cached object.
    """
    from llmlingua import PromptCompressor  # type: ignore

    logger.info("Loading LLMLingua-2 model: %s", MODEL_NAME)
    compressor = PromptCompressor(
        model_name=MODEL_NAME,
        use_llmlingua2=True,   # Enable LLMLingua-2 algorithm
        device_map="cpu",      # CPU-only; fast enough for BERT-base
    )
    logger.info("LLMLingua-2 model loaded successfully.")
    return compressor


def _count_tokens(text: str) -> int:
    """
    Approximate token count using the cached compressor's tokenizer,
    falling back to a whitespace split estimate if the model is not yet loaded.
    """
    try:
        compressor = get_compressor()
        tokenizer = compressor.tokenizer
        return len(tokenizer.encode(text))
    except Exception:
        # Rough fallback: ~1 token ≈ 0.75 words
        return max(1, int(len(text.split()) / 0.75))


def compress(
    text: str,
    rate: float = 0.5,
    target_token_count: Optional[int] = None,
    force_tokens: Optional[List[str]] = None,
) -> dict:
    """
    Compress *text* using LLMLingua-2.

    Parameters
    ----------
    text : str
        The full text to compress.
    rate : float
        Fraction of tokens to keep (0.5 = keep 50%). Ignored when
        `target_token_count` is provided.
    target_token_count : int | None
        Hard target. If supplied, the effective rate is derived from the
        current token count so that the output matches the target.
    force_tokens : list[str] | None
        Tokens/phrases that must not be removed by the compressor.

    Returns
    -------
    dict with keys: compressed_text, original_tokens, compressed_tokens,
    compression_ratio
    """
    if force_tokens is None:
        force_tokens = []

    original_tokens = _count_tokens(text)

    # Derive effective rate from target_token_count if supplied
    effective_rate = rate
    if target_token_count is not None and original_tokens > 0:
        effective_rate = max(0.01, min(0.99, target_token_count / original_tokens))

    compressor = get_compressor()

    logger.info(
        "Compressing %d tokens at rate=%.2f force_tokens=%s",
        original_tokens,
        effective_rate,
        force_tokens,
    )

    result = compressor.compress_prompt(
        text,
        rate=effective_rate,
        force_tokens=force_tokens,
    )

    compressed_text: str = result["compressed_prompt"]
    compressed_tokens = _count_tokens(compressed_text)
    compression_ratio = compressed_tokens / original_tokens if original_tokens > 0 else 1.0

    logger.info(
        "Compression done: %d -> %d tokens (ratio=%.3f)",
        original_tokens,
        compressed_tokens,
        compression_ratio,
    )

    return {
        "compressed_text": compressed_text,
        "original_tokens": original_tokens,
        "compressed_tokens": compressed_tokens,
        "compression_ratio": round(compression_ratio, 4),
    }
