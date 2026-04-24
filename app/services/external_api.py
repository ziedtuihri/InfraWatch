"""Service for consuming external API"""
import httpx
import logging
import ssl
from typing import Optional, Any, Dict
from fastapi import HTTPException
from config import settings

logger = logging.getLogger(__name__)


class ExternalAPIClient:
    """Client for consuming external API"""
    
    def __init__(self, base_url: str, bearer_token: str, verify_ssl: bool = False):
        self.base_url = base_url
        self.bearer_token = bearer_token
        self.verify_ssl = verify_ssl
        self.client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self):
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            verify=self.verify_ssl,  # Just pass False directly — that's all you need
            timeout=30.0,
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.client:
            await self.client.aclose()
    
    def _get_headers(self) -> Dict[str, str]:
        """Get request headers with authorization"""
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.bearer_token}",
        }
    
    async def get_instance_types(
        self,
        max_items: int = 25,
        offset: int = 0,
        sort: str = "name",
        direction: str = "asc",
    ) -> Dict[str, Any]:
        """
        Get instance types from external API
        
        Args:
            max_items: Maximum number of items to return
            offset: Offset for pagination
            sort: Field to sort by
            direction: Sort direction (asc or desc)
        
        Returns:
            API response as dictionary
        """
        if not self.client:
            raise RuntimeError("Client not initialized. Use 'async with' context manager.")
        
        params = {
            "max": max_items,
            "offset": offset,
            "sort": sort,
            "direction": direction,
        }
        
        try:
            logger.debug(f"Requesting {self.base_url}/api/instance-types with params: {params}")
            response = await self.client.get(
                "/api/instance-types",
                params=params,
                headers=self._get_headers(),
            )
            response.raise_for_status()
            logger.debug(f"Received response: {response.status_code}")
            return response.json()
        except httpx.RequestError as e:
            logger.error(f"API request error: {str(e)}")
            raise HTTPException(status_code=502, detail=f"Failed to reach external API: {str(e)}")
        except httpx.HTTPStatusError as e:
            logger.error(f"API HTTP error: {e.response.status_code} - {e.response.text}")
            raise HTTPException(status_code=502, detail=f"External API error: {e.response.status_code}")
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}", exc_info=True)
            raise HTTPException(status_code=502, detail=f"Unexpected error: {str(e)}")


async def get_instance_types(
    max_items: int = 25,
    offset: int = 0,
    sort: str = "name",
    direction: str = "asc",
) -> Dict[str, Any]:
    """
    Fetch instance types from external API
    
    Args:
        max_items: Maximum number of items to return
        offset: Offset for pagination
        sort: Field to sort by
        direction: Sort direction (asc or desc)
    
    Returns:
        Instance types data
    """
    try:
        async with ExternalAPIClient(
            base_url=settings.external_api_url,
            bearer_token=settings.external_api_token,
            verify_ssl=settings.external_api_verify_ssl,
        ) as client:
            return await client.get_instance_types(
                max_items=max_items,
                offset=offset,
                sort=sort,
                direction=direction,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_instance_types: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Service unavailable: {str(e)}")
