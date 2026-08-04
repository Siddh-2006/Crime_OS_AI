import base64
import requests
import json

url = "http://localhost:8002/predict"
image_path = r"D:\CRIME_OS_AI\WhatsApp Image 2026-07-28 at 22.14.25.jpeg"

with open(image_path, "rb") as f:
    base64_image = base64.b64encode(f.read()).decode("utf-8")

payload = {
    "image_base64": base64_image,
    "task": "<MORE_DETAILED_CAPTION>"
}

print("Sending request for <MORE_DETAILED_CAPTION>...")
response = requests.post(url, json=payload)
print("Status Code:", response.status_code)
try:
    print("Response:", json.dumps(response.json(), indent=2))
except Exception:
    print("Raw Response:", response.text)

print("\nSending request for <OCR>...")
payload["task"] = "<OCR>"
response = requests.post(url, json=payload)
print("Status Code:", response.status_code)
try:
    print("Response:", json.dumps(response.json(), indent=2))
except Exception:
    print("Raw Response:", response.text)
