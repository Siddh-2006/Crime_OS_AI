"""
Structured JSON logging.
Every log entry is a single JSON line with: timestamp, level,
service, request_id (if available), message, and extra fields.
Compatible with log aggregators (Datadog, ELK, CloudWatch).
"""
from __future__ import annotations

import json
import logging
import sys
import traceback
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings


class _JsonFormatter(logging.Formatter):
    """Emit each record as a single structured JSON line."""

    SERVICE = settings.APP_NAME.lower().replace(" ", "-")

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": self.SERVICE,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Attach caller location in DEBUG mode
        if settings.DEBUG:
            entry["location"] = f"{record.pathname}:{record.lineno}"

        # Attach any extra fields passed via extra={}
        _STDLIB_ATTRS = {
            "args", "asctime", "created", "exc_info", "exc_text", "filename",
            "funcName", "id", "levelname", "levelno", "lineno", "message",
            "module", "msecs", "msg", "name", "pathname", "process",
            "processName", "relativeCreated", "stack_info", "thread", "threadName",
        }
        for key, value in record.__dict__.items():
            if key not in _STDLIB_ATTRS:
                entry[key] = value

        if record.exc_info:
            entry["exception"] = "".join(traceback.format_exception(*record.exc_info))

        return json.dumps(entry, default=str)


class _TextFormatter(logging.Formatter):
    """Human-readable formatter for local development."""
    _FMT = "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s"
    datefmt = "%H:%M:%S"

    def __init__(self) -> None:
        super().__init__(fmt=self._FMT, datefmt=self.datefmt)


def _build_handler() -> logging.Handler:
    handler = logging.StreamHandler(sys.stdout)
    if settings.LOG_FORMAT == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(_TextFormatter())
    return handler


def get_logger(name: str = "complaint_intelligence") -> logging.Logger:
    """
    Return a configured logger.
    Calling this multiple times with the same name returns the same logger
    (Python's logging module caches by name).
    """
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    logger = logging.getLogger(name)

    if not logger.handlers:
        logger.addHandler(_build_handler())
        logger.setLevel(log_level)
        logger.propagate = False

    return logger


# Module-level default logger
logger = get_logger()
