"""
Unit tests for app.core.config
"""
import pytest
from app.core.config import Settings


@pytest.mark.unit
def test_default_values():
    s = Settings()
    assert s.APP_ENV == "development"
    assert s.PORT == 8001
    assert s.REDIS_PORT == 6379
    assert s.LOG_LEVEL == "INFO"
    assert s.QUEUE_MAX_TRIES == 3


@pytest.mark.unit
def test_redis_url_no_password():
    s = Settings(REDIS_HOST="myredis", REDIS_PORT=6380, REDIS_PASSWORD="", REDIS_DB=2)
    assert s.redis_url == "redis://myredis:6380/2"


@pytest.mark.unit
def test_redis_url_with_password():
    s = Settings(REDIS_HOST="myredis", REDIS_PORT=6379, REDIS_PASSWORD="secret", REDIS_DB=0)
    assert s.redis_url == "redis://:secret@myredis:6379/0"


@pytest.mark.unit
def test_is_production_false():
    s = Settings(APP_ENV="development")
    assert s.is_production is False


@pytest.mark.unit
def test_is_production_true():
    s = Settings(APP_ENV="production")
    assert s.is_production is True


@pytest.mark.unit
def test_invalid_app_env_raises():
    with pytest.raises(Exception):
        Settings(APP_ENV="invalid")


@pytest.mark.unit
def test_invalid_log_level_raises():
    with pytest.raises(Exception):
        Settings(LOG_LEVEL="VERBOSE")
