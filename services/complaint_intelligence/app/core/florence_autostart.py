"""
florence_autostart.py
=====================
Auto-starts the Florence-2 REST service if it is not already running.

Usage:
    from app.core.florence_autostart import ensure_florence_running
    await ensure_florence_running()   # call once at the start of any pipeline

Behaviour:
  1. Sends a health-check GET to <FLORENCE_BASE_URL>/health.
  2. If the service responds → logs "already running", returns True.
  3. If not reachable → spawns `python app.py` inside services/florence_service/
     using the florence_service's own .venv (if present) or the system Python.
  4. Polls /health every 3 s for up to MAX_WAIT_SECONDS (default 120).
  5. Returns True on success, False if the service never came up.

The spawned process is kept alive for the lifetime of the calling process.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
import sys
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────────────────
# Root of the whole repository (two levels up from this file:
#   app/core/florence_autostart.py → app/ → complaint_intelligence/ → services/ → Crime_OS_AI/)
_THIS_FILE   = Path(__file__).resolve()
_SERVICES    = _THIS_FILE.parent.parent.parent.parent          # …/services/
_FLORENCE_DIR = _SERVICES / "florence_service"                  # …/services/florence_service/

# Python interpreter: prefer the florence_service venv
_VENV_PYTHON_WIN  = _FLORENCE_DIR / ".venv" / "Scripts" / "python.exe"
_VENV_PYTHON_UNIX = _FLORENCE_DIR / ".venv" / "bin" / "python"

def _pick_python() -> str:
    """Return the best python executable for the florence_service venv."""
    for candidate in (_VENV_PYTHON_WIN, _VENV_PYTHON_UNIX):
        if candidate.exists():
            return str(candidate)
    return sys.executable          # fallback: same Python that runs this script


# ── Public API ───────────────────────────────────────────────────────────────
_florence_proc: subprocess.Popen | None = None   # keep reference so GC doesn't kill it


async def ensure_florence_running(
    florence_base_url: str = "http://localhost:8002",
    max_wait_seconds: int = 120,
    poll_interval: float = 3.0,
) -> bool:
    """
    Ensure the Florence-2 service is running.

    Returns True if service is (or becomes) reachable, False on timeout.
    """
    global _florence_proc

    health_url = florence_base_url.rstrip("/") + "/health"

    # ── 1. Already running? ──────────────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(health_url)
            if r.status_code < 500:
                logger.info("[Florence] Service already running at %s", florence_base_url)
                print(f"  ✓ [Florence] Service already running at {florence_base_url}")
                return True
    except (httpx.ConnectError, httpx.TimeoutException):
        pass   # not running yet — fall through to auto-start

    # -- 2. Not running — spawn it --------------------------------------------
    if not _FLORENCE_DIR.exists():
        logger.error(
            "[Florence] Directory does not exist: %s",
            _FLORENCE_DIR,
        )
        print(f"  [ERROR] [Florence] Directory not found: {_FLORENCE_DIR}")
        return False

    python_exe = _pick_python()
    app_script = _FLORENCE_DIR / "app.py"

    logger.warning(
        "[Florence] Service NOT running. Auto-starting: %s %s",
        python_exe, app_script,
    )
    print(f"\n  [Florence] Service is NOT running - auto-starting...")
    print(f"     -> python : {python_exe}")
    print(f"     -> script : {app_script}")
    print(f"     -> cwd    : {_FLORENCE_DIR}")
    print(f"     (Model will download ~450 MB on first run - please wait)\n")

    try:
        _florence_proc = subprocess.Popen(
            [python_exe, str(app_script)],
            cwd=str(_FLORENCE_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except Exception as exc:
        logger.error("[Florence] Failed to start process: %s", exc)
        print(f"  [ERROR] [Florence] Could not launch process: {exc}")
        return False

    # -- 3. Poll until healthy ------------------------------------------------
    print(f"  [Florence] Waiting up to {max_wait_seconds}s for service to become ready...")
    elapsed = 0.0
    dots = 0
    async with httpx.AsyncClient(timeout=4.0) as client:
        while elapsed < max_wait_seconds:
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
            dots += 1

            # Check if process died early
            if _florence_proc.poll() is not None:
                out, _ = _florence_proc.communicate()
                logger.error("[Florence] Process exited early. Output:\n%s", out)
                print(f"\n  [ERROR] [Florence] Process crashed on startup. Output:\n{out[:800]}")
                return False

            try:
                r = await client.get(health_url)
                if r.status_code < 500:
                    logger.info(
                        "[Florence] Service became ready after %.0fs at %s",
                        elapsed, florence_base_url,
                    )
                    print(f"\n  [SUCCESS] [Florence] Service is ready! (took {elapsed:.0f}s)")
                    return True
            except (httpx.ConnectError, httpx.TimeoutException):
                print(f"  [Florence] Still starting... ({elapsed:.0f}s elapsed)", end="\r")

    # -- 4. Timeout -----------------------------------------------------------
    logger.error(
        "[Florence] Service did not become ready within %ds. "
        "Continuing without Florence - OCR (PaddleOCR) will be used as fallback.",
        max_wait_seconds,
    )
    print(
        f"\n  ⚠️  [Florence] Service did not start within {max_wait_seconds}s. "
        f"Continuing — PaddleOCR will be used as fallback."
    )
    return False
