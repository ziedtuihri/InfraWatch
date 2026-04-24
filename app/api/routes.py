from fastapi import APIRouter, Query, HTTPException
from app.services.external_api import get_instance_types
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["items"])

@router.get("/items")
async def get_items():
    """Get all items"""
    return {"items": []}

@router.post("/items")
async def create_item(item: dict):
    """Create a new item"""
    return {"created": item}

@router.get("/items/{item_id}")
async def get_item(item_id: int):
    """Get a specific item"""
    return {"item_id": item_id}


# External API endpoints
@router.get("/instance-types")
async def fetch_instance_types(
    max: int = Query(25, description="Maximum number of items"),
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
