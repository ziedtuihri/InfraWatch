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
        # Disable proxy by setting all proxies to None
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            verify=self.verify_ssl,
            timeout=30.0,
            mounts={
                "http://": None,
                "https://": None,
            },
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

    async def get_activity_list(
        self,
        max_items: int = 25,
        offset: int = 0,
        sort: str = "name",
        order: str = "asc",
        timeframe: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get activity list from external API

        Args:
            max_items: Maximum number of items to return
            offset: Offset for pagination
            sort: Field to sort by
            order: Sort order (asc or desc)
            timeframe: Timeframe filter (e.g., month, week, day)
        
        Returns:
            API response as dictionary
        """
        if not self.client:
            raise RuntimeError("Client not initialized. Use 'async with' context manager.")
        
        params = {
            "max": max_items,
            "offset": offset,
            "sort": sort,
            "order": order,
        }
        if timeframe:
            params["timeframe"] = timeframe
        
        try:
            logger.debug(f"Requesting {self.base_url}/api/activity with params: {params}")
            response = await self.client.get(
                "/api/activity",
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

    async def get_service_plans(self) -> Dict[str, Any]:
        """
        Get server service plans from external API
        
        Returns:
            API response as dictionary
        """
        if not self.client:
            raise RuntimeError("Client not initialized. Use 'async with' context manager.")
        
        try:
            logger.debug(f"Requesting {self.base_url}/api/servers/service-plans")
            response = await self.client.get(
                "/api/servers/service-plans",
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

    async def get_alerts(
        self,
        max_items: int = 25,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Get monitoring alerts from external API

        Args:
            max_items: Maximum number of items to return
            offset: Offset for pagination
        
        Returns:
            API response as dictionary
        """
        if not self.client:
            raise RuntimeError("Client not initialized. Use 'async with' context manager.")
        
        params = {
            "max": max_items,
            "offset": offset,
        }
        
        try:
            logger.debug(f"Requesting {self.base_url}/api/monitoring/alerts with params: {params}")
            response = await self.client.get(
                "/api/monitoring/alerts",
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

    async def get_blueprints(
        self,
        max_items: int = 25,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Get blueprints from external API

        Args:
            max_items: Maximum number of items to return
            offset: Offset for pagination
        
        Returns:
            API response as dictionary
        """
        if not self.client:
            raise RuntimeError("Client not initialized. Use 'async with' context manager.")
        
        params = {
            "max": max_items,
            "offset": offset,
        }
        
        try:
            logger.debug(f"Requesting {self.base_url}/api/blueprints with params: {params}")
            response = await self.client.get(
                "/api/blueprints",
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

    async def get_apps(
        self,
        max_items: int = 25,
        offset: int = 0,
        show_deleted: bool = False,
    ) -> Dict[str, Any]:
        """
        Get apps from external API

        Args:
            max_items: Maximum number of items to return
            offset: Offset for pagination
            show_deleted: Whether to show deleted apps
        
        Returns:
            API response as dictionary
        """
        if not self.client:
            raise RuntimeError("Client not initialized. Use 'async with' context manager.")
        
        params = {
            "max": max_items,
            "offset": offset,
            "showDeleted": show_deleted,
        }
        
        try:
            logger.debug(f"Requesting {self.base_url}/api/apps with params: {params}")
            response = await self.client.get(
                "/api/apps",
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

    async def get_budgets(
        self,
        max_items: int = 25,
        offset: int = 0,
        sort: str = "name",
        direction: str = "asc",
    ) -> Dict[str, Any]:
        """
        Get budgets from external API

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
            logger.debug(f"Requesting {self.base_url}/api/budgets with params: {params}")
            response = await self.client.get(
                "/api/budgets",
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

    async def get_clients(
        self,
        max_items: int = 25,
        offset: int = 0,
        sort: str = "clientId",
        direction: str = "asc",
    ) -> Dict[str, Any]:
        """
        Get clients from external API

        Args:
            max_items: Maximum number of items to return
            offset: Offset for pagination
            sort: Field to sort by (default: clientId)
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
            logger.debug(f"Requesting {self.base_url}/api/clients with params: {params}")
            response = await self.client.get(
                "/api/clients",
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


async def get_activity_list(
    max_items: int = 25,
    offset: int = 0,
    sort: str = "name",
    order: str = "asc",
    timeframe: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch activity list from external API
    
    Args:
        max_items: Maximum number of items to return
        offset: Offset for pagination
        sort: Field to sort by
        order: Sort order (asc or desc)
        timeframe: Timeframe filter (e.g., month, week, day)
    
    Returns:
        Activity list data
    """
    try:
        async with ExternalAPIClient(
            base_url=settings.external_api_url,
            bearer_token=settings.external_api_token,
            verify_ssl=settings.external_api_verify_ssl,
        ) as client:
            return await client.get_activity_list(
                max_items=max_items,
                offset=offset,
                sort=sort,
                order=order,
                timeframe=timeframe,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_activity_list: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Service unavailable: {str(e)}")


async def get_service_plans() -> Dict[str, Any]:
    """
    Fetch server service plans from external API
    
    Returns:
        Service plans data
    """
    try:
        async with ExternalAPIClient(
            base_url=settings.external_api_url,
            bearer_token=settings.external_api_token,
            verify_ssl=settings.external_api_verify_ssl,
        ) as client:
            return await client.get_service_plans()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_service_plans: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Service unavailable: {str(e)}")


async def get_alerts(
    max_items: int = 25,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Fetch monitoring alerts from external API
    
    Args:
        max_items: Maximum number of items to return
        offset: Offset for pagination
    
    Returns:
        Alerts data
    """
    try:
        async with ExternalAPIClient(
            base_url=settings.external_api_url,
            bearer_token=settings.external_api_token,
            verify_ssl=settings.external_api_verify_ssl,
        ) as client:
            return await client.get_alerts(
                max_items=max_items,
                offset=offset,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_alerts: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Service unavailable: {str(e)}")


async def get_blueprints(
    max_items: int = 25,
    offset: int = 0,
) -> Dict[str, Any]:
    """
    Fetch blueprints from external API
    
    Args:
        max_items: Maximum number of items to return
        offset: Offset for pagination
    
    Returns:
        Blueprints data
    """
    try:
        async with ExternalAPIClient(
            base_url=settings.external_api_url,
            bearer_token=settings.external_api_token,
            verify_ssl=settings.external_api_verify_ssl,
        ) as client:
            return await client.get_blueprints(
                max_items=max_items,
                offset=offset,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_blueprints: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Service unavailable: {str(e)}")


async def get_apps(
    max_items: int = 25,
    offset: int = 0,
    show_deleted: bool = False,
) -> Dict[str, Any]:
    """
    Fetch apps from external API
    
    Args:
        max_items: Maximum number of items to return
        offset: Offset for pagination
        show_deleted: Whether to show deleted apps
    
    Returns:
        Apps data
    """
    try:
        async with ExternalAPIClient(
            base_url=settings.external_api_url,
            bearer_token=settings.external_api_token,
            verify_ssl=settings.external_api_verify_ssl,
        ) as client:
            return await client.get_apps(
                max_items=max_items,
                offset=offset,
                show_deleted=show_deleted,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_apps: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Service unavailable: {str(e)}")


async def get_budgets(
    max_items: int = 25,
    offset: int = 0,
    sort: str = "name",
    direction: str = "asc",
) -> Dict[str, Any]:
    """
    Fetch budgets from external API
    
    Args:
        max_items: Maximum number of items to return
        offset: Offset for pagination
        sort: Field to sort by
        direction: Sort direction (asc or desc)
    
    Returns:
        Budgets data
    """
    try:
        async with ExternalAPIClient(
            base_url=settings.external_api_url,
            bearer_token=settings.external_api_token,
            verify_ssl=settings.external_api_verify_ssl,
        ) as client:
            return await client.get_budgets(
                max_items=max_items,
                offset=offset,
                sort=sort,
                direction=direction,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_budgets: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Service unavailable: {str(e)}")


async def get_clients(
    max_items: int = 25,
    offset: int = 0,
    sort: str = "clientId",
    direction: str = "asc",
) -> Dict[str, Any]:
    """
    Fetch clients from external API
    
    Args:
        max_items: Maximum number of items to return
        offset: Offset for pagination
        sort: Field to sort by (default: clientId)
        direction: Sort direction (asc or desc)
    
    Returns:
        Clients data
    """
    try:
        async with ExternalAPIClient(
            base_url=settings.external_api_url,
            bearer_token=settings.external_api_token,
            verify_ssl=settings.external_api_verify_ssl,
        ) as client:
            return await client.get_clients(
                max_items=max_items,
                offset=offset,
                sort=sort,
                direction=direction,
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_clients: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Service unavailable: {str(e)}")


