"""
Health check endpoints.

GET /health          — liveness probe (always 200 while process is up)
GET /health/detailed — readiness probe (checks Redis reachability + queue depth)

Used by Docker HEALTHCHECK, Kubernetes probes, and load balancers.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.deps import get_queue
from app.core.config import settings
from app.core.redis import ping_redis
from app.queue.interface import IQueue

router = APIRouter(prefix="/health", tags=["Health"])

_STARTED_AT = datetime.now(timezone.utc).isoformat()


# ─── Response schemas ─────────────────────────────────────────────────────────

class LivenessResponse(BaseModel):
    status: str = "ok"
    service: str
    version: str
    environment: str
    started_at: str


class DependencyStatus(BaseModel):
    name: str
    status: str          # "ok" | "degraded" | "unavailable"
    details: str = ""


class ReadinessResponse(BaseModel):
    status: str          # "ready" | "degraded" | "not_ready"
    service: str
    version: str
    checked_at: str
    dependencies: list[DependencyStatus]
    queue_depth: int


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=LivenessResponse,
    summary="Liveness probe",
    description="Returns 200 as long as the process is running. "
                "Used by orchestrators to decide whether to restart.",
)
async def liveness() -> LivenessResponse:
    return LivenessResponse(
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        started_at=_STARTED_AT,
    )


@router.get(
    "/detailed",
    summary="Readiness probe",
    description="Checks Redis connectivity and returns queue depth. "
                "Returns 200 if all dependencies are reachable, 503 otherwise.",
)
async def readiness(
    queue: Annotated[IQueue, Depends(get_queue)],
) -> JSONResponse:
    deps: list[DependencyStatus] = []

    # Redis check
    redis_ok = await ping_redis()
    deps.append(DependencyStatus(
        name="redis",
        status="ok" if redis_ok else "unavailable",
        details="" if redis_ok else "ping failed",
    ))

    # Queue depth
    queue_depth = 0
    try:
        queue_depth = await queue.depth()
        deps.append(DependencyStatus(name="queue", status="ok"))
    except Exception as exc:
        deps.append(DependencyStatus(name="queue", status="unavailable", details=str(exc)))

    all_ok = all(d.status == "ok" for d in deps)
    overall = "ready" if all_ok else "not_ready"
    http_status = status.HTTP_200_OK if all_ok else status.HTTP_503_SERVICE_UNAVAILABLE

    body = ReadinessResponse(
        status=overall,
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
        checked_at=datetime.now(timezone.utc).isoformat(),
        dependencies=deps,
        queue_depth=queue_depth,
    )

    return JSONResponse(status_code=http_status, content=body.model_dump())
