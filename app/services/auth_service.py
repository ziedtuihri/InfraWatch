"""Authentication against local PostgreSQL (not Morpheus API)."""
import logging
import secrets
from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import HTTPException
from psycopg.rows import dict_row

from app.db.postgres import get_postgres_pool
from app.schemas.auth import UserInfo

logger = logging.getLogger(__name__)

SECRET_KEY = "your-secret-key-change-in-production"   # move to env var
ALGORITHM  = "HS256"
TOKEN_EXPIRE_HOURS = 8


def create_jwt_token(user_id: int, username: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def authenticate_user(username: str, password: str):
    try:
        pool = get_postgres_pool()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Authentication service unavailable")

    try:
        async with pool.connection() as connection:
            async with connection.cursor(row_factory=dict_row) as cursor:
                await cursor.execute(
                    "SELECT id, username, password, role FROM users WHERE username = %s",
                    (username,),
                )
                row = await cursor.fetchone()
    except Exception as exc:
        logger.error("PostgreSQL error during login: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="Authentication service unavailable")

    if row is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    stored_password = row["password"] or ""
    is_valid = False

    if stored_password.startswith("$2b$") or stored_password.startswith("$2a$"):
        try:
            is_valid = bcrypt.checkpw(password.encode("utf-8"), stored_password.encode("utf-8"))
        except Exception:
            is_valid = False
    else:
        is_valid = secrets.compare_digest(stored_password, password)

    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # ✅ Generate JWT
    token = create_jwt_token(row["id"], row["username"], row["role"] or "user")
    user  = UserInfo(id=row["id"], username=row["username"], role=row["role"])

    return token, user