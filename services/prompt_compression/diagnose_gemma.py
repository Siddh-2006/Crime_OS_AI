import requests, sys, textwrap

COMPRESS_URL = "http://localhost:8005/compress"
OLLAMA_URL   = "http://localhost:11434/api/generate"
GEMMA_MODEL  = "gemma4:e2b"
QUESTION     = (
    "Summarize the key facts, dates, and any phone numbers or case IDs "
    "mentioned in this text. Be specific and list each one explicitly."
)
FORCE_TOKENS = [
    "COMP-21973124-a615-4b00-a523-9cb8e0dc3f4b",
    "FIR/SBM/2026/0441", "CYB-2026-AHM-0441",
    "2026-07-15", "2026-07-24", "2026-08-12",
    "9427000111", "+91-9820044571", "BNS-117",
    "EV-001", "LOC/AHM/2026/0187",
]

# Read sample from test_manual.py's FALLBACK_TEXT — import it directly
sys.path.insert(0, ".")
from test_manual import FALLBACK_TEXT

# 1. Compress
print("Compressing...", flush=True)
cr = requests.post(COMPRESS_URL, json={
    "text": FALLBACK_TEXT,
    "rate": 0.5,
    "force_tokens": FORCE_TOKENS,
}, timeout=120).json()
compressed = cr["compressed_text"]
print(f"Done: {cr['original_tokens']} -> {cr['compressed_tokens']} tokens\n")

print("=== COMPRESSED TEXT SENT TO GEMMA ===")
print(compressed)
print()

# 2. Query Gemma with compressed
print("Querying Gemma with COMPRESSED text...", flush=True)
resp = requests.post(OLLAMA_URL, json={
    "model": GEMMA_MODEL,
    "prompt": QUESTION + "\n\n---\n\n" + compressed,
    "stream": False,
    "options": {"temperature": 0.1, "num_predict": 800},
}, timeout=300).json()
comp_response = resp.get("response", "")
print()
print("=== GEMMA RESPONSE (COMPRESSED INPUT) ===")
print(comp_response)
print()

# 3. Check tokens
print("=== TOKEN CHECK IN GEMMA COMPRESSED RESPONSE ===")
for tok in FORCE_TOKENS:
    found = tok.lower() in comp_response.lower()
    # Also check common reformatting
    alt_found = False
    if tok == "2026-07-15":
        alt_found = "july 15" in comp_response.lower() or "15 july" in comp_response.lower()
    elif tok == "2026-07-24":
        alt_found = "july 24" in comp_response.lower()
    elif tok == "2026-08-12":
        alt_found = "august 12" in comp_response.lower() or "12 august" in comp_response.lower()
    status = "EXACT" if found else ("REFORMATTED" if alt_found else "MISSING")
    print(f"  {'OK' if found or alt_found else 'XX'}  {tok:<46}  {status}")
