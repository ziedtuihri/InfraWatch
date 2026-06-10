"""Authentication against local PostgreSQL (not Morpheus API)."""
import logging
import secrets

from fastapi import HTTPException
from psycopg.rows import dict_row

from app.db.postgres import get_postgres_pool
from app.schemas.auth import UserInfo

logger = logging.getLogger(__name__)


async def authenticate_user(username: str, password: str) -> UserInfo:
    """
    Validate username and password against the local PostgreSQL users table.

    Passwords are stored and compared in plain text (no hashing).

    Raises HTTPException 401 if credentials are invalid.
    Raises HTTPException 503 if the database is unavailable.
    """
    try:
        pool = get_postgres_pool()
    except RuntimeError:
        logger.error("Login attempted but PostgreSQL pool is not initialized")
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable: database not configured",
        )

    row = None
    try:
        async with pool.connection() as connection:
            async with connection.cursor(row_factory=dict_row) as cursor:
                await cursor.execute(
                    """
                    SELECT id, username, password, role
                    FROM users
                    WHERE username = %s
                    """,
                    (username,),
                )
                row = await cursor.fetchone()
    except Exception as exc:
        logger.error("PostgreSQL error during login: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable",
        )

    if row is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    stored_password = row["password"] or ""
    if not secrets.compare_digest(stored_password, password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return UserInfo(id=row["id"], username=row["username"], role=row["role"])
