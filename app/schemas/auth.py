from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Username")
    password: str = Field(..., min_length=1, description="Password")


class UserInfo(BaseModel):
    id: int
    username: str
    role: Optional[str] = None


class LoginResponse(BaseModel):
    success: bool = True
    token: str          # ✅ add this
    user: UserInfo


class UserCreate(BaseModel):
    username: str = Field(..., min_length=1, description="Username")
    email: str = Field(..., min_length=1, description="Email")
    password: str = Field(..., min_length=1, description="Password")
    role: Optional[str] = "user"


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    role: Optional[str] = None
    created_at: Optional[datetime] = None
