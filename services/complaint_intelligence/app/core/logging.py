import logging
import sys
import json
from datetime import datetime, timezone
from app.core.config import settings


class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON line (Winston-compatible)."""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname.lower(),
            "service": "complaint-intelligence",
            "message": record.getMessage(),
            "logger": record.name,
        }

        # Attach any extra kwargs passed via `extra=`
        for key, value in record.__dict__.items():
            if key not in (
                "args", "asctime", "created", "exc_info", "exc_text",
                "filename", "funcName", "id", "levelname", "levelno",
                "lineno", "module", "msecs", "message", "msg",
                "name", "pathname", "process", "processName",
                "relativeCreated", "stack_info", "thread", "threadName",
            ):
                log_data[key] = value

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data, default=str)


def _build_logger(name: str = "complaint_intelligence") -> logging.Logger:
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(_JsonFormatter())
    handler.setLevel(log_level)

    logger = logging.getLogger(name)
    logger.setLevel(log_level)
    logger.addHandler(handler)
    logger.propagate = False  # don't double-log via root logger

    return logger


logger = _build_logger()
