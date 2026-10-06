from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Username")
    password: str = Field(..., min_length=1, description="Password")


class UserInfo(BaseModel):
    id: int
    username: str


class LoginResponse(BaseModel):
    success: bool = True
    user: UserInfo
