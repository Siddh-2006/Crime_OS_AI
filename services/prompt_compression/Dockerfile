# ── Prompt Compression Service ────────────────────────────────────────────────
# LLMLingua-2 BERT-base multilingual — CPU-friendly, no GPU required.

FROM python:3.12-slim

LABEL maintainer="Crime OS AI Team"
LABEL description="LLMLingua-2 based prompt compression microservice"

WORKDIR /service

# System deps (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Pre-download the model into the image at build time (optional but recommended
# for production: remove the RUN line if you prefer runtime download).
# RUN python -c "from llmlingua import PromptCompressor; PromptCompressor('microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank', use_llmlingua2=True, device_map='cpu')"

EXPOSE 8005

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8005", "--workers", "1"]
