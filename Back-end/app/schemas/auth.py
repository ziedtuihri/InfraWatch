from pydantic import BaseModel, Field
from typing import Optional


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Username")
    password: str = Field(..., min_length=1, description="Password")


class UserInfo(BaseModel):
    id: int
    username: str
    role: str  # 'admin' | 'viewer'


class LoginResponse(BaseModel):
    success: bool = True
    user: UserInfo


# ---------- Morpheus config ----------

class MorpheusConfigIn(BaseModel):
    morpheus_url: str = Field(..., min_length=1, description="Morpheus base URL")
    morpheus_token: str = Field(..., min_length=1, description="Morpheus bearer token")
    # Save without the live reachability/token test (e.g. appliance temporarily down)
    skip_live_check: bool = False



class MorpheusConfigOut(BaseModel):
    morpheus_url: str
    morpheus_token: str


# ---------- Session save ----------

class SaveSessionRequest(BaseModel):
    config: dict = Field(..., description="Full wizard config snapshot")
    session_name: Optional[str] = Field(None, description="Optional label")
