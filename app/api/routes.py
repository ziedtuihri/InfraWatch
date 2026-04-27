from fastapi import APIRouter, Query, HTTPException
from app.services.external_api import (
    get_All_Instances,
    get_instance_types,
    get_activity_list,
    get_service_plans,
    get_alerts,
    get_blueprints,
    get_apps,
    get_budgets,
    get_clients,
)
import logging
from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["items"])

# External API endpoints
@router.get("/instance-types")
async def fetch_instance_types(
    max: int = Query(1000000000, description="Maximum number of items"),
    offset: int = Query(0, description="Offset for pagination"),
    sort: str = Query("name", description="Field to sort by"),
    direction: str = Query("asc", description="Sort direction (asc or desc)"),
):
    """
    Fetch instance types from external API
    
    Route: GET /api/v1/instance-types
    
    Query Parameters:
    - **max**: Maximum number of items to return (default: 25)
    - **offset**: Offset for pagination (default: 0)
    - **sort**: Field to sort by (default: name)
    - **direction**: Sort direction asc or desc (default: asc)
    """
    try:
        logger.info(f"Fetching instance types with params: max={max}, offset={offset}, sort={sort}, direction={direction}")
        result = await get_instance_types(
            max_items=max,
            offset=offset,
            sort=sort,
            direction=direction,
        )
        logger.info("Successfully fetched instance types")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching instance types: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch instance types: {str(e)}")


# External API endpoints
@router.get("/activity")
async def fetch_activity_list(
    max: int = Query(25, description="Maximum number of items"),
    offset: int = Query(0, description="Offset for pagination"),
    sort: str = Query("name", description="Field to sort by"),
    order: str = Query("asc", description="Sort order (asc or desc)"),
    timeframe: Optional[str] = Query(None, description="Timeframe filter (e.g., month, week, day)"),
):
    """
    Fetch activity list from external API
    
    Route: GET /api/v1/activity
    
    Query Parameters:
    - **max**: Maximum number of items to return (default: 25)
    - **offset**: Offset for pagination (default: 0)
    - **sort**: Field to sort by (default: name)
    - **order**: Sort order asc or desc (default: asc)
    - **timeframe**: Timeframe filter like month, week, day (optional)
    """
    try:
        logger.info(f"Fetching activity list with params: max={max}, offset={offset}, sort={sort}, order={order}, timeframe={timeframe}")
        result = await get_activity_list(
            max_items=max,
            offset=offset,
            sort=sort,
            order=order,
            timeframe=timeframe,
        )
        logger.info("Successfully fetched activity list")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching activity list: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch activity list: {str(e)}")


@router.get("/service-plans")
async def fetch_service_plans():
    """
    Fetch server service plans from external API
    
    Route: GET /api/v1/service-plans
    """
    try:
        logger.info("Fetching service plans")
        result = await get_service_plans()
        logger.info("Successfully fetched service plans")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching service plans: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch service plans: {str(e)}")


@router.get("/alerts")
async def fetch_alerts(
    max: int = Query(25, description="Maximum number of items"),
    offset: int = Query(0, description="Offset for pagination"),
):
    """
    Fetch monitoring alerts from external API
    
    Route: GET /api/v1/alerts
    
    Query Parameters:
    - **max**: Maximum number of items to return (default: 25)
    - **offset**: Offset for pagination (default: 0)
    """
    try:
        logger.info(f"Fetching alerts with params: max={max}, offset={offset}")
        result = await get_alerts(
            max_items=max,
            offset=offset,
        )
        logger.info("Successfully fetched alerts")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching alerts: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch alerts: {str(e)}")


@router.get("/blueprints")
async def fetch_blueprints(
    max: int = Query(25, description="Maximum number of items"),
    offset: int = Query(0, description="Offset for pagination"),
):
    """
    Fetch blueprints from external API
    
    Route: GET /api/v1/blueprints
    
    Query Parameters:
    - **max**: Maximum number of items to return (default: 25)
    - **offset**: Offset for pagination (default: 0)
    """
    try:
        logger.info(f"Fetching blueprints with params: max={max}, offset={offset}")
        result = await get_blueprints(
            max_items=max,
            offset=offset,
        )
        logger.info("Successfully fetched blueprints")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching blueprints: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch blueprints: {str(e)}")


@router.get("/apps")
async def fetch_apps(
    max: int = Query(25, description="Maximum number of items"),
    offset: int = Query(0, description="Offset for pagination"),
    show_deleted: bool = Query(False, description="Show deleted apps"),
):
    """
    Fetch apps from external API
    
    Route: GET /api/v1/apps
    
    Query Parameters:
    - **max**: Maximum number of items to return (default: 25)
    - **offset**: Offset for pagination (default: 0)
    - **show_deleted**: Whether to show deleted apps (default: false)
    """
    try:
        logger.info(f"Fetching apps with params: max={max}, offset={offset}, show_deleted={show_deleted}")
        result = await get_apps(
            max_items=max,
            offset=offset,
            show_deleted=show_deleted,
        )
        logger.info("Successfully fetched apps")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching apps: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch apps: {str(e)}")


@router.get("/budgets")
async def fetch_budgets(
    max: int = Query(25, description="Maximum number of items"),
    offset: int = Query(0, description="Offset for pagination"),
    sort: str = Query("name", description="Field to sort by"),
    direction: str = Query("asc", description="Sort direction (asc or desc)"),
):
    """
    Fetch budgets from external API
    
    Route: GET /api/v1/budgets
    
    Query Parameters:
    - **max**: Maximum number of items to return (default: 25)
    - **offset**: Offset for pagination (default: 0)
    - **sort**: Field to sort by (default: name)
    - **direction**: Sort direction asc or desc (default: asc)
    """
    try:
        logger.info(f"Fetching budgets with params: max={max}, offset={offset}, sort={sort}, direction={direction}")
        result = await get_budgets(
            max_items=max,
            offset=offset,
            sort=sort,
            direction=direction,
        )
        logger.info("Successfully fetched budgets")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching budgets: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch budgets: {str(e)}")


@router.get("/clients")
async def fetch_clients(
    max: int = Query(25, description="Maximum number of items"),
    offset: int = Query(0, description="Offset for pagination"),
    sort: str = Query("clientId", description="Field to sort by"),
    direction: str = Query("asc", description="Sort direction (asc or desc)"),
):
    """
    Fetch clients from external API
    
    Route: GET /api/v1/clients
    
    Query Parameters:
    - **max**: Maximum number of items to return (default: 25)
    - **offset**: Offset for pagination (default: 0)
    - **sort**: Field to sort by (default: clientId)
    - **direction**: Sort direction asc or desc (default: asc)
    """
    try:
        logger.info(f"Fetching clients with params: max={max}, offset={offset}, sort={sort}, direction={direction}")
        result = await get_clients(
            max_items=max,
            offset=offset,
            sort=sort,
            direction=direction,
        )
        logger.info("Successfully fetched clients")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching clients: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch clients: {str(e)}")
    

@router.get("/AllInstances")
async def fetch_All_Instances(
    max: int = Query(25, description="Maximum number of items"),
    offset: int = Query(0, description="Offset for pagination"),
    show_deleted: bool = Query(False, description="Whether to include deleted instances"),
    details: bool = Query(False, description="Whether to include detailed information"),
):
    """
    Fetch all instances from external API
    
    Route: GET /api/v1/instances
    
    Query Parameters:
    - **max**: Maximum number of items to return (default: 25)
    - **offset**: Offset for pagination (default: 0)
    - **show_deleted**: Whether to include deleted instances (default: False)
    - **details**: Whether to include detailed information (default: False)
    """
    try:
        logger.info(f"Fetching all instances with params: max={max}, offset={offset}, show_deleted={show_deleted}, details={details}")
        result = await get_All_Instances(
            max_items=max,
            offset=offset,
            show_deleted=show_deleted,
            details=details,
        )
        logger.info("Successfully fetched all instances")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching all instances: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch all instances: {str(e)}")

