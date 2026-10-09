"""Local PostgreSQL connection pool (used only for authentication)."""
import logging
from typing import Optional

from psycopg_pool import AsyncConnectionPool

from config import settings

logger = logging.getLogger(__name__)

_pool: Optional[AsyncConnectionPool] = None


async def init_postgres_pool() -> None:
    """Create the PostgreSQL connection pool on application startup."""
    global _pool
    if _pool is not None:
        return

    if not settings.database_url:
        logger.warning("DATABASE_URL is not configured; login will be unavailable")
        return

    _pool = AsyncConnectionPool(
        conninfo=settings.database_url,
        min_size=1,
        max_size=10,
        open=False,
    )
    await _pool.open()
    logger.info("PostgreSQL connection pool initialized")


async def close_postgres_pool() -> None:
    """Close the PostgreSQL connection pool on application shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("PostgreSQL connection pool closed")


def get_postgres_pool() -> AsyncConnectionPool:
    """Return the active PostgreSQL pool."""
    if _pool is None:
        raise RuntimeError("PostgreSQL pool is not initialized")
    return _pool
