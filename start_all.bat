@echo off
echo =======================================================
echo Crime OS AI - Full System Startup Script
echo =======================================================

echo IMPORTANT: Please ensure Docker Desktop is running!
echo After Docker starts, run these two commands in a terminal:
echo docker run -d --name crime-os-redis -p 6379:6379 redis:alpine
echo docker run -d --name crime-os-qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant
echo.
echo Press any key to start all the Python and Node.js servers...
pause

echo 1. Starting Ollama (Local LLM)...
start "Ollama" cmd /k "ollama serve"

echo 2. Starting Python: Legal Agent (Port 8001)...
start "Legal Agent (8001)" cmd /k "call .venv\Scripts\activate && cd services\legal_agent && uvicorn app.main:app --port 8001 --reload"

echo 3. Starting Python: IO Recommendation (Port 8003)...
start "IO Recommendation (8003)" cmd /k "call .venv\Scripts\activate && cd services\io-recommendation && uvicorn app.main:app --port 8003 --reload"

echo 4. Starting Python: Complaint Intelligence (Port 8000)...
start "Complaint Intelligence (8000)" cmd /k "call .venv\Scripts\activate && cd services\complaint_intelligence && uvicorn app.main:app --port 8000 --reload"

echo 5. Starting Python: Florence Service...
start "Florence Service" cmd /k "call .venv\Scripts\activate && cd services\florence_service && python app.py"

echo 6. Starting Indic Translation Model (Sarvam on Port 8004)...
start "Sarvam Translation (8004)" cmd /k "echo Starting llama-server for Sarvam-1... && llama-server -m sarvam-1.Q8_0.gguf -c 2048 --port 8004"

echo 7. Starting Ingestion Service (Atlas Complaints)...
start "Ingestion Service" cmd /k "call .venv\Scripts\activate && cd services\complaint_intelligence && python process_all_atlas_complaints.py"

echo 8. Starting Backend (Node.js Port 5000)...
start "Backend (5000)" cmd /k "cd backend && npm run dev"

echo 9. Starting Frontend (Next.js Port 3000)...
start "Frontend (3000)" cmd /k "cd frontend && npm run dev"

echo =======================================================
echo All services launched in separate windows!
echo =======================================================
pause
