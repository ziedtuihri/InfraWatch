from fastapi import APIRouter, Query
from app.services.external_api import get_instance_types

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
    max: int = Query(1000, description="Maximum number of items"),
    offset: int = Query(0, description="Offset for pagination"),
    sort: str = Query("name", description="Field to sort by"),
    direction: str = Query("asc", description="Sort direction (asc or desc)"),
):
    """
    Fetch instance types from external API
    
    - **max**: Maximum number of items to return (default: 25)
    - **offset**: Offset for pagination (default: 0)
    - **sort**: Field to sort by (default: name)
    - **direction**: Sort direction asc or desc (default: asc)
    """
    return await get_instance_types(
        max_items=max,
        offset=offset,
        sort=sort,
        direction=direction,
    )
