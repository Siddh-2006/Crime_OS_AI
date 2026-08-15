import requests, json

OLLAMA_URL = "http://localhost:11434/api/generate"
GEMMA_MODEL = "gemma4:e2b"

# Minimal test to see raw response structure
payload = {
    "model": GEMMA_MODEL,
    "prompt": "Say hello.",
    "stream": False,
    "options": {"temperature": 0.1, "num_predict": 50},
}
resp = requests.post(OLLAMA_URL, json=payload, timeout=60).json()
print("Keys:", list(resp.keys()))
print("response:", repr(resp.get("response", "")))
print("thinking:", repr(resp.get("thinking", "")))
print("done_reason:", resp.get("done_reason", ""))
