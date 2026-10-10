import os
from typing import Any

SMTP_HOST: str = os.getenv("SMTP_HOST", "")
SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "notifications@everesttextiles.com")
SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "Everest Textile Mills")
SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")
SMTP_USE_SSL: bool = os.getenv("SMTP_USE_SSL", "false").lower() in ("true", "1", "yes")

_raw_frontend = os.getenv("FRONTEND_ORIGIN", os.getenv("FRONTEND_URL", "http://localhost:3000"))
FRONTEND_URL: str = _raw_frontend.split(",")[0].strip()

# Testing outbox for automated unit and integration tests
TEST_MODE: bool = os.getenv("EMAIL_TEST_MODE", "false").lower() in ("true", "1", "yes")
TEST_OUTBOX: list[dict[str, Any]] = []


def is_smtp_configured() -> bool:
    """Returns True if minimum SMTP server credentials are provided."""
    return bool(SMTP_HOST and SMTP_HOST.strip())


def clear_test_outbox() -> None:
    """Clears the in-memory testing outbox."""
    TEST_OUTBOX.clear()


def set_test_mode(enabled: bool) -> None:
    """Enables or disables test mode."""
    global TEST_MODE
    TEST_MODE = enabled
