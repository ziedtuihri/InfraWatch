from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    """Application settings"""
    
    # App settings
    app_name: str = "Dashboard API"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    
    # Database settings (optional)
    database_url: Optional[str] = None
    
    # CORS settings
    cors_origins: list = ["*"]
    cors_allow_credentials: bool = True
    cors_allow_methods: list = ["*"]
    cors_allow_headers: list = ["*"]
    
    # External API settings
    external_api_url: str = "https://projet1-virtual-machine"
    external_api_token: str = "ea3c4b6b-4b64-47f5-9954-89e184ec3039"
    external_api_verify_ssl: bool = False
    
    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
