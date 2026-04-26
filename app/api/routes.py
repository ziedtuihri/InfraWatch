from fastapi import APIRouter, Query, HTTPException
from app.services.external_api import get_activity_list, get_instance_types
import logging

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
    max: int = Query(1000000000, description="Maximum number of items"),
    offset: int = Query(0, description="Offset for pagination"),
    sort: str = Query("name", description="Field to sort by"),
    direction: str = Query("asc", description="Sort direction (asc or desc)"),
):
    """
    Fetch  activity list from external API
    
    Route: GET /api/v1/activity_list
    
    Query Parameters:
    - **max**: Maximum number of items to return (default: 25)
    - **offset**: Offset for pagination (default: 0)
    - **sort**: Field to sort by (default: name)
    - **direction**: Sort direction asc or desc (default: asc)
    """
    try:
        logger.info(f"Fetching activity list with params: max={max}, offset={offset}, sort={sort}, direction={direction}")
        result = await get_instance_types(
            max_items=max,
            offset=offset,
            sort=sort,
            direction=direction,
        )
        logger.info("Successfully fetched activity list")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching activity list: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch activity list: {str(e)}")



