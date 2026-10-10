
import os
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import make_url

from app.database import Base
import app.models  # noqa: F401 — registers all models with Base.metadata


# --------------------------------------------------
# Alembic configuration
# --------------------------------------------------

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Load backend/.env, regardless of the current working directory.
backend_dir = Path(__file__).resolve().parents[1]
env_file = backend_dir / ".env"
load_dotenv(env_file)

database_url = os.getenv("DATABASE_URL")

if not database_url:
    raise RuntimeError(
        f"DATABASE_URL is missing. Add it to {env_file}"
    )

# Validate the URL and ensure SQLAlchemy recognizes the driver.
try:
    parsed_url = make_url(database_url)
except Exception as exc:
    raise RuntimeError("DATABASE_URL is not a valid SQLAlchemy URL") from exc

if parsed_url.drivername != "postgresql+psycopg":
    raise RuntimeError(
        "Expected DATABASE_URL to use "
        "'postgresql+psycopg://'. Check backend/.env."
    )

# Alembic's ConfigParser treats '%' as interpolation syntax.
config.set_main_option(
    "sqlalchemy.url",
    database_url.replace("%", "%%"),
)

# Importing app.models above registers the mapped tables.
target_metadata = Base.metadata


# --------------------------------------------------
# Offline migrations
# --------------------------------------------------

def run_migrations_offline() -> None:
    """Run migrations without creating a database connection."""

    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# --------------------------------------------------
# Online migrations
# --------------------------------------------------

def run_migrations_online() -> None:
    """Run migrations using a live database connection."""

    connectable = engine_from_config(
        config.get_section(config.config_ini_section) or {},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
            )

            with context.begin_transaction():
                context.run_migrations()
    finally:
        connectable.dispose()


# --------------------------------------------------
# Entry point
# --------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

