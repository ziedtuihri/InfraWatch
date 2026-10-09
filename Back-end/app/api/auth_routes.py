from fastapi import APIRouter, HTTPException, Header
from typing import Optional, Union
import logging

from app.schemas.auth import (
    LoginRequest, LoginResponse,
    MorpheusConfigIn, MorpheusConfigOut,
    SaveSessionRequest,
)
from config import settings
from app.core.security import hash_password
from app.core.validation import (
    ValidationError,
    check_morpheus_connection,
    validate_morpheus_url,
)
from app.services.auth_service import (
    authenticate_user,
    get_morpheus_config,
    upsert_morpheus_config,
    save_user_session,
    get_latest_user_session,
    get_all_user_sessions,
    get_threshold_config,
    upsert_threshold_config,
    get_resource_tool_config,
    upsert_resource_tool_config,
    sync_alert_log,
    acknowledge_alert_log,
    get_alert_log,
    get_acknowledged_alert_ids,
    create_task_run,
    update_task_run,
    get_task_run_progress,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["auth"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _require_user_id(x_user_id: Optional[str]) -> int:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    try:
        return int(x_user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid X-User-Id header")


def _require_admin(x_user_role: Optional[str]) -> None:
    """Admin OR superadmin — for routes any administrator may use (system
    config, viewing the user list). superadmin is a strict superset of
    admin's access, never a separate gate."""
    if x_user_role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")


def _require_superadmin(x_user_role: Optional[str]) -> None:
    """For routes only the original/distinguished admin account may use:
    creating new users, and acting on admin/superadmin accounts."""
    if x_user_role != "superadmin":
        raise HTTPException(status_code=403, detail="Superadmin access required")


def _require_can_manage_target(actor_role: Optional[str], target_role: str) -> None:
    """
    Gate for actions that mutate a SPECIFIC other user (delete, role
    change): a superadmin can act on anyone; a regular admin can only act
    on viewer accounts — never on another admin, and never on a
    superadmin. Without this, any admin could delete or demote the
    original/distinguished admin account, which is exactly what
    superadmin exists to prevent.
    """
    if actor_role == "superadmin":
        return
    if actor_role == "admin" and target_role == "viewer":
        return
    raise HTTPException(
        status_code=403,
        detail="Only a superadmin can manage admin or superadmin accounts."
    )


# ── login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest):
    """
    Authenticate a user against the local PostgreSQL database.
    Returns user info including role ('admin' | 'viewer').
    """
    try:
        logger.info("Login attempt for user: %s", credentials.username)
        user = await authenticate_user(credentials.username, credentials.password)
        logger.info("Login successful for user: %s (role=%s)", credentials.username, user.role)
        return LoginResponse(user=user)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Unexpected error during login: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Login failed")


# ── morpheus config (admin only) ──────────────────────────────────────────────

@router.get("/morpheus-config", response_model=MorpheusConfigOut)
async def get_morpheus_cfg(
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    x_user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """Get stored Morpheus URL + token for the authenticated admin."""
    _require_admin(x_user_role)
    user_id = _require_user_id(x_user_id)

    row = await get_morpheus_config(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="No Morpheus config saved yet")
    return MorpheusConfigOut(morpheus_url=row["morpheus_url"], morpheus_token=row["morpheus_token"])


@router.put("/morpheus-config")
async def save_morpheus_cfg(
    body: MorpheusConfigIn,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    x_user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """Save (upsert) Morpheus URL + token. Admin only.

    Rejects the request before anything is stored when:
      * the URL is malformed                  -> 422 {code, message}
      * the appliance is unreachable/timeout  -> 502 {code, message}
      * the API token is rejected by Morpheus -> 401 {code, message}
    """
    _require_admin(x_user_role)
    user_id = _require_user_id(x_user_id)

    # 1) format validation - no network involved
    try:
        base_url = validate_morpheus_url(body.morpheus_url)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail={"code": e.code, "message": e.detail})

    # 2) live check - reachability and token validity in one call.
    #    Can be bypassed with skip_live_check when the appliance is known to
    #    be temporarily down (URL format validation above always applies).
    verified = False
    if not body.skip_live_check:
        result = await check_morpheus_connection(
            base_url, body.morpheus_token, verify_ssl=settings.external_api_verify_ssl
        )
        if not result.ok:
            status = 401 if result.code == "bad_token" else 502
            raise HTTPException(status_code=status, detail={"code": result.code, "message": result.detail})
        verified = True

    await upsert_morpheus_config(user_id, base_url, body.morpheus_token)
    return {"success": True, "message": "Morpheus config saved", "morpheus_url": base_url, "verified": verified}


# ── session save (on Launch) ──────────────────────────────────────────────────

@router.post("/sessions")
async def create_session(
    body: SaveSessionRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Persist the wizard config snapshot when the user clicks Launch."""
    user_id = _require_user_id(x_user_id)
    session_id = await save_user_session(user_id, body.config, body.session_name)
    return {"success": True, "session_id": session_id}


@router.get("/sessions/latest")
async def get_latest_session(
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Return the most recent saved session config for this user."""
    user_id = _require_user_id(x_user_id)
    row = await get_latest_user_session(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="No sessions found")
    return {
        "id":           row["id"],
        "session_name": row["session_name"],
        "config":       row["config"],
        "created_at":   row["created_at"].isoformat() if row["created_at"] else None,
    }


@router.get("/sessions")
async def list_sessions(
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Return all saved sessions for this user, newest first."""
    user_id = _require_user_id(x_user_id)
    rows = await get_all_user_sessions(user_id)
    return [
        {
            "id":           r["id"],
            "session_name": r["session_name"],
            "config":       r["config"],
            "created_at":   r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


# ── user management (admin only) ─────────────────────────────────────────────

from pydantic import BaseModel

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "viewer"


class SignupRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    phone: Optional[str] = None


@router.post("/signup")
async def signup(body: SignupRequest):
    """
    Public self-service account creation — no auth required, unlike
    POST /users which is admin-only. Always creates a 'viewer' role; an
    admin can promote the account later via the RBAC page. Email/phone are
    optional here and feed the same columns the "My Notifications"
    self-service card already manages — signup just captures them at the
    earliest natural moment instead of requiring a second visit later.
    """
    username = body.username.strip()
    password = body.password.strip()
    if not username or not password:
        raise HTTPException(status_code=422, detail="Username and password are required.")
    if len(password) < 4:
        raise HTTPException(status_code=422, detail="Password must be at least 4 characters.")

    from app.db.postgres import get_postgres_pool
    from psycopg.rows import dict_row
    pool = get_postgres_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """
                    INSERT INTO users (username, password, role, email, phone)
                    VALUES (%s, %s, 'viewer', %s, %s)
                    RETURNING id, username, role, created_at, email, phone
                    """,
                    (username, hash_password(password), body.email or None, body.phone or None),
                )
                row = await cur.fetchone()
        return row
    except HTTPException:
        raise
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="That username is already taken.")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/users")
async def list_users(
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    x_user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """List all users. Admin only."""
    _require_admin(x_user_role)
    _require_user_id(x_user_id)

    from app.db.postgres import get_postgres_pool
    from psycopg.rows import dict_row
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
            rows = await cur.fetchall()
    return rows


@router.post("/users")
async def create_user(
    body: CreateUserRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    x_user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """
    Create a new user. Superadmin only — regular admins can no longer add
    accounts directly; self-service signup (always 'viewer') plus a
    superadmin promoting that account afterward covers that case.
    """
    _require_superadmin(x_user_role)
    _require_user_id(x_user_id)

    if body.role not in ("admin", "viewer", "superadmin"):
        raise HTTPException(status_code=422, detail="Role must be 'admin', 'viewer', or 'superadmin'")

    from app.db.postgres import get_postgres_pool
    from psycopg.rows import dict_row
    pool = get_postgres_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    """
                    INSERT INTO users (username, password, role)
                    VALUES (%s, %s, %s)
                    RETURNING id, username, role, created_at
                    """,
                    (body.username, hash_password(body.password), body.role),
                )
                row = await cur.fetchone()
        return row
    except Exception as exc:
        if "unique" in str(exc).lower():
            raise HTTPException(status_code=409, detail="Username already exists")
        raise HTTPException(status_code=500, detail=str(exc))


# ── task run progress tracking ──────────────────────────────────────────────

class TaskRunCreate(BaseModel):
    run_id: str
    resource_id: str
    task_id: int
    task_name: str

class TaskRunUpdate(BaseModel):
    status: str  # pending | running | success | failed
    detail: Optional[str] = None


@router.post("/task-runs")
async def create_task_run_endpoint(
    body: TaskRunCreate,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Register a new pending task run row. Returns the row id to update later."""
    try:
        user_id = int(x_user_id) if x_user_id else None
    except ValueError:
        user_id = None
    row_id = await create_task_run(body.run_id, user_id, body.resource_id, body.task_id, body.task_name)
    return {"id": row_id}


@router.patch("/task-runs/{row_id}")
async def update_task_run_endpoint(row_id: int, body: TaskRunUpdate):
    """Update a task run's status as it progresses (running → success/failed)."""
    await update_task_run(row_id, body.status, body.detail)
    return {"success": True}


@router.get("/task-runs/{run_id}/progress")
async def get_task_run_progress_endpoint(run_id: str):
    """Poll the live progress of all tasks belonging to a wizard launch run."""
    rows = await get_task_run_progress(run_id)
    return {"run_id": run_id, "tasks": rows}


# ── alert audit log ───────────────────────────────────────────────────────────

class AlertSyncItem(BaseModel):
    id: Union[str, int]
    name: str
    sev: str
    rawSev: Optional[str] = None
    status: str = 'active'
    source: Optional[str] = None
    env: Optional[str] = None
    thresholdMatched: bool = False
    thresholdId: Optional[str] = None
    thresholdVal: Optional[float] = None
    thresholdUnit: Optional[str] = None
    thresholdSev: Optional[str] = None

class AlertSyncRequest(BaseModel):
    resource_id: str
    alerts: list[AlertSyncItem]

class AcknowledgeRequest(BaseModel):
    resource_id: str
    alert_ext_id: str

@router.post("/alerts/sync")
async def sync_alerts(
    body: AlertSyncRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Upsert current alert batch into the audit log."""
    _require_user_id(x_user_id)
    await sync_alert_log(body.resource_id, [a.model_dump() for a in body.alerts])
    return {"synced": len(body.alerts)}

@router.patch("/alerts/acknowledge")
async def ack_alert(
    body: AcknowledgeRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Acknowledge a specific alert in the audit log."""
    user_id = _require_user_id(x_user_id)
    found = await acknowledge_alert_log(body.resource_id, body.alert_ext_id, user_id)
    if not found:
        raise HTTPException(status_code=404, detail="Alert not found in log")
    return {"success": True}

@router.get("/alerts/acknowledged-ids")
async def get_acknowledged_ids(
    resource_id: str,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Lightweight lookup — which alert ids are currently acknowledged for this resource."""
    _require_user_id(x_user_id)
    ids = await get_acknowledged_alert_ids(resource_id)
    return {"resource_id": resource_id, "acknowledged_ids": ids}


@router.get("/alerts/log")
async def get_alerts_log(
    resource_id: str,
    limit: int = 100,
    offset: int = 0,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Return paginated alert audit log for a resource."""
    _require_user_id(x_user_id)
    rows = await get_alert_log(resource_id, limit, offset)
    return {"resource_id": resource_id, "alerts": rows}


# ── threshold configs ─────────────────────────────────────────────────────────

class ThresholdRow(BaseModel):
    id: str
    label: str
    val: float
    max: float
    sev: str          # 'Warning' | 'Critical'
    action: str
    unit: str
    enabled: bool = True


class SaveThresholdsRequest(BaseModel):
    resource_id: str
    thresholds: list[ThresholdRow]


@router.get("/thresholds")
async def get_thresholds(
    resource_id: str,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """Return saved threshold config for the given resource, or 404."""
    user_id = _require_user_id(x_user_id)
    rows = await get_threshold_config(user_id, resource_id)
    if rows is None:
        raise HTTPException(status_code=404, detail="No threshold config saved yet")
    return {"resource_id": resource_id, "thresholds": rows}


@router.put("/thresholds")
async def save_thresholds(
    body: SaveThresholdsRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    x_user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """Upsert threshold config for a resource. Admin-only — thresholds
    determine what counts as a breach for every viewer of this resource,
    so this is a configuration action, not a per-user preference."""
    user_id = _require_user_id(x_user_id)
    _require_admin(x_user_role)
    await upsert_threshold_config(
        user_id,
        body.resource_id,
        [t.model_dump() for t in body.thresholds],
    )
    return {"success": True}


class ToolConfigIn(BaseModel):
    metrics: dict = {}
    logs: dict = {}


@router.get("/resource-tools")
async def get_resource_tools(
    resource_id: str,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    """
    Return the shared tool/exporter selection for a resource — readable
    by any authenticated role. This is what's actually running on the
    VM, not a per-user wizard preference, so a viewer can see exactly
    what an admin already configured (e.g. Prometheus + node_exporter)
    and pick a matching Grafana template, instead of seeing a blank,
    unconfigured-looking step with zero visibility into reality.
    """
    _require_user_id(x_user_id)
    cfg = await get_resource_tool_config(resource_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail="No tool config saved yet for this resource")
    return {"resource_id": resource_id, **cfg}


@router.put("/resource-tools")
async def save_resource_tools(
    resource_id: str,
    body: ToolConfigIn,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    x_user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """Upsert the shared tool/exporter selection for a resource.
    Admin/superadmin only — this determines what Morpheus actually
    provisions on the VM, so it's infrastructure configuration, not a
    personal preference, even though every role can read it."""
    user_id = _require_user_id(x_user_id)
    _require_admin(x_user_role)
    await upsert_resource_tool_config(resource_id, body.metrics, body.logs, user_id)
    return {"success": True}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    x_user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """
    Delete a user. Cannot delete yourself. A regular admin may only delete
    viewer accounts — deleting an admin or superadmin requires being a
    superadmin yourself.
    """
    _require_admin(x_user_role)
    requester_id = _require_user_id(x_user_id)

    if requester_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    from app.db.postgres import get_postgres_pool
    pool = get_postgres_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT role FROM users WHERE id = %s", (user_id,))
                target = await cur.fetchone()
            if not target:
                raise HTTPException(status_code=404, detail="User not found")
            _require_can_manage_target(x_user_role, target[0])

            result = await conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        # A bare DB-level failure here (e.g. a foreign key still pointing
        # at this user with no ON DELETE behavior) previously surfaced as
        # an unhandled 500 with no CORS headers attached, which the
        # browser reports as a CORS error rather than the real failure.
        # Surface it as a clean 500 with an actual message instead.
        logger.error(f"[delete_user] failed to delete user {user_id}: {exc}")
        raise HTTPException(status_code=500, detail=f"Could not delete user: {exc}")


class UpdateUserRoleRequest(BaseModel):
    role: str


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    body: UpdateUserRoleRequest,
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
    x_user_role: Optional[str] = Header(None, alias="x-user-role"),
):
    """
    Promote or demote a user's role. Cannot change your own role.

    A regular admin may only change a viewer's role (e.g. promoting them
    to admin) — they cannot touch an existing admin or superadmin account.
    Only a superadmin can demote an admin, promote someone to superadmin,
    or act on another superadmin at all.
    """
    requester_id = _require_user_id(x_user_id)
    _require_admin(x_user_role)

    if body.role not in ("admin", "viewer", "superadmin"):
        raise HTTPException(status_code=422, detail="Role must be 'admin', 'viewer', or 'superadmin'")
    if body.role == "superadmin" and x_user_role != "superadmin":
        raise HTTPException(status_code=403, detail="Only a superadmin can grant superadmin access.")
    if requester_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    from app.db.postgres import get_postgres_pool
    from psycopg.rows import dict_row
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT role FROM users WHERE id = %s", (user_id,))
            target = await cur.fetchone()
            if not target:
                raise HTTPException(status_code=404, detail="User not found")
            _require_can_manage_target(x_user_role, target["role"])

            await cur.execute(
                "UPDATE users SET role = %s WHERE id = %s RETURNING id, username, role, created_at",
                (body.role, user_id),
            )
            row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return row
