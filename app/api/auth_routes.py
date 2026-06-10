from fastapi import APIRouter, HTTPException
import logging

from app.schemas.auth import LoginRequest, LoginResponse, UserCreate, UserOut
from app.services.auth_service import authenticate_user
from app.db.postgres import get_postgres_pool
from psycopg.rows import dict_row

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest):
    """
    Authenticate a user against the local PostgreSQL database.

    Route: POST /api/v1/login

    This endpoint does not call the Morpheus external API.
    """
    try:
        logger.info("Login attempt for user: %s", credentials.username)
        user = await authenticate_user(credentials.username, credentials.password)
        logger.info("Login successful for user: %s", credentials.username)
        return LoginResponse(user=user)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected error during login: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Login failed")


@router.get("/users", response_model=list[UserOut])
async def list_users():
    """
    List all users in the system.
    """
    try:
        pool = get_postgres_pool()
        async with pool.connection() as connection:
            async with connection.cursor(row_factory=dict_row) as cursor:
                await cursor.execute(
                    """
                    SELECT id, username, email, role, created_at
                    FROM users
                    ORDER BY id ASC
                    """
                )
                rows = await cursor.fetchall()
                return [UserOut(**row) for row in rows]
    except Exception as exc:
        logger.error("Error listing users: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list users")


@router.post("/users", response_model=UserOut)
async def create_user(user: UserCreate):
    """
    Create a new user.
    """
    try:
        pool = get_postgres_pool()
        async with pool.connection() as connection:
            async with connection.cursor(row_factory=dict_row) as cursor:
                # Check if username or email already exists
                await cursor.execute(
                    """
                    SELECT id FROM users WHERE username = %s OR email = %s
                    """,
                    (user.username, user.email),
                )
                existing = await cursor.fetchone()
                if existing:
                    raise HTTPException(
                        status_code=400,
                        detail="Username or email already exists"
                    )

                await cursor.execute(
                    """
                    INSERT INTO users (username, email, password, role)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, username, email, role, created_at
                    """,
                    (user.username, user.email, user.password, user.role),
                )
                new_row = await cursor.fetchone()
                await connection.commit()
                return UserOut(**new_row)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error creating user: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create user")


@router.delete("/users/{user_id}")
async def delete_user(user_id: int):
    """
    Delete a user by ID.
    """
    try:
        pool = get_postgres_pool()
        async with pool.connection() as connection:
            async with connection.cursor(row_factory=dict_row) as cursor:
                await cursor.execute(
                    """
                    DELETE FROM users
                    WHERE id = %s
                    RETURNING id
                    """,
                    (user_id,),
                )
                deleted = await cursor.fetchone()
                if not deleted:
                    raise HTTPException(status_code=404, detail="User not found")
                await connection.commit()
                return {"success": True, "deleted_id": user_id}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error deleting user: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete user")
