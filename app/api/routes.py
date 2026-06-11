from fastapi import APIRouter, Query, HTTPException, Body
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
    get_All_Images,
    execute_task,
    make_managed,
    get_specific_ip
)
import logging
from typing import Optional, Dict, Any

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
    


@router.get("/AllImages")
async def fetch_All_Images(
    max: int = Query(25, description="Maximum number of items"),
):
    """
    Fetch all instances from external API
    
    Route: GET /api/v1/instances
    
    Query Parameters:
    - **max**: Maximum number of items to return (default: 25)
    """
    try:
        logger.info(f"Fetching all instances with params: max={max}")
        result = await get_All_Images(
            max_items=max,
        )
        logger.info("Successfully fetched all instances")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching all instances: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to fetch all instances: {str(e)}")


@router.post("/tasks/{task_id}/execute")
async def execute_task_endpoint(
    task_id: int,
    payload: Dict[str, Any] = Body(...),
):
    """
    Execute a task by ID
    
    Route: POST /api/v1/tasks/{task_id}/execute
    """
    try:
        job = payload.get("job")
        if not isinstance(job, dict):
            raise HTTPException(status_code=422, detail="Missing or invalid 'job' in request body")

        logger.info(
            "Executing task %s with job keys: %s",
            task_id,
            sorted(list(job.keys())),
        )
        result = await execute_task(
            task_id=task_id,
            job=job,
        )
        logger.info(f"Successfully executed task {task_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing task {task_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to execute task: {str(e)}")


@router.put("/servers/{server_id}/make-managed")
async def make_managed_endpoint(
    server_id: str,
    payload: Dict[str, Any] = Body(...),
):
    """
    Mark a server as managed by ID/UUID.

    Route: PUT /api/v1/servers/{server_id}/make-managed
    Body:
    {
      "server": {
        "sshHost": "...",
        "sshUsername": "...",
        "sshPassword": "..."
      },
      "installAgent": true
    }
    """
    try:
        server = payload.get("server")
        if not isinstance(server, dict):
            raise HTTPException(status_code=422, detail="Missing or invalid 'server' in request body")

        ssh_host = server.get("sshHost")
        ssh_username = server.get("sshUsername")
        ssh_password = server.get("sshPassword")
        if not ssh_host or not ssh_username or not ssh_password:
            raise HTTPException(
                status_code=422,
                detail="Missing 'server.sshHost', 'server.sshUsername' or 'server.sshPassword' in request body",
            )

        install_agent = payload.get("installAgent")
        if not isinstance(install_agent, bool):
            raise HTTPException(status_code=422, detail="Missing or invalid 'installAgent' (must be boolean)")

        logger.info("Marking server %s as managed (installAgent=%s)", server_id, install_agent)
        result = await make_managed(
            server_id=server_id,
            server=server,
            install_agent=install_agent,
        )
        logger.info("Successfully triggered make-managed for server %s", server_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error make-managed for server %s: %s", server_id, str(e), exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to make server managed: {str(e)}")



@router.get("/networks/floating-ips/{ip_id}")
async def get_specific_ip_endpoint(ip_id: str):
    """
    Get a specific floating IP by ID.

    Route: GET /api/v1/networks/floating-ips/{ip_id}
    """

    try:
        logger.info("Fetching floating IP with id %s", ip_id)

        result = await get_specific_ip(ip_id=ip_id)

        logger.info("Successfully retrieved floating IP %s", ip_id)
        return result

    except HTTPException:
        raise

    except Exception as e:
        logger.error(
            "Error fetching floating IP %s: %s",
            ip_id,
            str(e),
            exc_info=True
        )
        raise HTTPException(
            status_code=502,
            detail=f"Failed to retrieve floating IP: {str(e)}"
        )


