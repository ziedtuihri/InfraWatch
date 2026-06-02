from fastapi import APIRouter, HTTPException
import logging

from app.schemas.auth import LoginRequest, LoginResponse
from app.services.auth_service import authenticate_user

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
