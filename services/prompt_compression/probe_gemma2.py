import requests, json, sys
sys.path.insert(0, "services/prompt_compression")
from test_manual import FALLBACK_TEXT, FALLBACK_FORCE

COMPRESS_URL = "http://localhost:8005/compress"
OLLAMA_URL   = "http://localhost:11434/api/generate"
GEMMA_MODEL  = "gemma4:e2b"
QUESTION     = (
    "Summarize the key facts, dates, and any phone numbers or case IDs "
    "mentioned in this text. Be specific and list each one explicitly."
)

# Get compressed text
cr = requests.post(COMPRESS_URL, json={
    "text": FALLBACK_TEXT, "rate": 0.5, "force_tokens": FALLBACK_FORCE
}, timeout=120).json()
compressed = cr["compressed_text"]

# Try with think=False to suppress thinking mode
payload = {
    "model": GEMMA_MODEL,
    "prompt": QUESTION + "\n\n---\n\n" + compressed,
    "stream": False,
    "think": False,
    "options": {"temperature": 0.1, "num_predict": 800},
}
resp = requests.post(OLLAMA_URL, json=payload, timeout=300).json()
print("Keys:", list(resp.keys()))
print("response:", repr(resp.get("response", "")[:200]))
print("thinking:", repr(resp.get("thinking", "")[:100]))
print("done_reason:", resp.get("done_reason",""))
