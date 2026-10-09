"""Authentication and config services against local PostgreSQL."""
import json
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from psycopg.rows import dict_row

from app.db.postgres import get_postgres_pool
from app.schemas.auth import UserInfo

from app.core.security import decrypt_secret, encrypt_secret, hash_password, verify_password

logger = logging.getLogger(__name__)


# ── Auth ──────────────────────────────────────────────────────────────────────

async def authenticate_user(username: str, password: str) -> UserInfo:
    try:
        pool = get_postgres_pool()
    except RuntimeError:
        logger.error("Login attempted but PostgreSQL pool is not initialized")
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable: database not configured",
        )

    row = None
    try:
        async with pool.connection() as connection:
            async with connection.cursor(row_factory=dict_row) as cursor:
                await cursor.execute(
                    "SELECT id, username, password, role FROM users WHERE username = %s",
                    (username,),
                )
                row = await cursor.fetchone()
    except Exception as exc:
        logger.error("PostgreSQL error during login: %s", exc, exc_info=True)
        raise HTTPException(status_code=503, detail="Authentication service unavailable")

    if row is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    ok, needs_rehash = verify_password(password, row["password"] or "")
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if needs_rehash:
        # Legacy plaintext row - transparently upgrade to PBKDF2 on login
        try:
            async with pool.connection() as connection:
                await connection.execute(
                    "UPDATE users SET password = %s WHERE id = %s",
                    (hash_password(password), row["id"]),
                )
            logger.info("Upgraded password hash for user %s", row["username"])
        except Exception as exc:
            logger.warning("Could not upgrade password hash for user %s: %s",
                           row["username"], exc)

    return UserInfo(id=row["id"], username=row["username"], role=row["role"])


# ── Morpheus config ───────────────────────────────────────────────────────────

async def get_morpheus_config(user_id: int) -> Optional[dict]:
    """Return stored morpheus_url and morpheus_token for a user, or None."""
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT morpheus_url, morpheus_token FROM morpheus_config WHERE user_id = %s",
                (user_id,),
            )
            row = await cur.fetchone()
            if row and row.get("morpheus_token"):
                row["morpheus_token"] = decrypt_secret(row["morpheus_token"])
            return row


async def upsert_morpheus_config(user_id: int, morpheus_url: str, morpheus_token: str) -> None:
    """Insert or update morpheus config for an admin user."""
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        await conn.execute(
            """
            INSERT INTO morpheus_config (user_id, morpheus_url, morpheus_token, updated_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET morpheus_url = EXCLUDED.morpheus_url,
                          morpheus_token = EXCLUDED.morpheus_token,
                          updated_at = NOW()
            """,
            (user_id, morpheus_url, encrypt_secret(morpheus_token)),
        )


# ── Sessions ──────────────────────────────────────────────────────────────────

async def save_user_session(user_id: int, config: dict, session_name: Optional[str] = None) -> int:
    """Persist a wizard launch config snapshot. Returns the new session id."""
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO user_sessions (user_id, session_name, config)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (user_id, session_name, json.dumps(config)),
            )
            row = await cur.fetchone()
            return row[0]


async def get_latest_user_session(user_id: int) -> Optional[dict]:
    """Return the most recent session config for a user, or None."""
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, session_name, config, created_at
                FROM user_sessions
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (user_id,),
            )
            return await cur.fetchone()


async def create_task_run(run_id: str, user_id: Optional[int], resource_id: str, task_id: int, task_name: str) -> int:
    """Insert a pending task_run row, return its DB id."""
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                INSERT INTO task_runs (run_id, user_id, resource_id, task_id, task_name, status, created_at)
                VALUES (%s, %s, %s, %s, %s, 'pending', NOW())
                RETURNING id
                """,
                (run_id, user_id, resource_id, task_id, task_name),
            )
            row = await cur.fetchone()
            return row["id"]


async def update_task_run(run_row_id: int, status: str, detail: Optional[str] = None) -> None:
    """Update status/detail of a task_run, stamping started_at/finished_at as appropriate."""
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        if status == "running":
            await conn.execute(
                "UPDATE task_runs SET status = %s, started_at = NOW(), detail = %s WHERE id = %s",
                (status, detail, run_row_id),
            )
        elif status in ("success", "failed"):
            await conn.execute(
                "UPDATE task_runs SET status = %s, finished_at = NOW(), detail = %s WHERE id = %s",
                (status, detail, run_row_id),
            )
        else:
            await conn.execute(
                "UPDATE task_runs SET status = %s, detail = %s WHERE id = %s",
                (status, detail, run_row_id),
            )


async def get_task_run_progress(run_id: str) -> list:
    """Return all task_runs rows for a given run_id, ordered by creation, for progress polling."""
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, run_id, resource_id, task_id, task_name, status, detail,
                       started_at, finished_at, created_at
                FROM task_runs
                WHERE run_id = %s
                ORDER BY id ASC
                """,
                (run_id,),
            )
            rows = await cur.fetchall()
            return [
                {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row.items()}
                for row in rows
            ]


async def sync_alert_log(resource_id: str, alerts: list) -> None:
    """
    Record a batch of currently-firing alerts into alert_log.

    alert_log allows multiple rows per (resource_id, alert_ext_id) — the
    latest row is the alert's current state, and all rows together are its
    full history. This function decides, per alert, whether the latest
    existing row should just be updated in place (still the same ongoing
    occurrence) or whether a brand NEW row should be appended (a fresh
    occurrence after an acknowledgement snoozed it).

    Acknowledgement = snooze, not permanent mute:
    - Acknowledging suppresses an alert for a duration based on severity
      (currently 1 minute for testing — see the two CASE branches below).
    - If the SAME alert_ext_id is still firing once that snooze expires,
      this appends a NEW row with status='active' instead of overwriting
      the acknowledged row. The old row — who acknowledged it, when, at
      what severity — is never touched again. Full traceability without
      needing a second table: "current state" is just "the latest row."
    - A severity escalation while snoozed (e.g. Warning -> Critical) also
      appends a fresh active row immediately, without waiting out the rest
      of the snooze window.
    """
    if not alerts:
        return
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            for a in alerts:
                alert_ext_id = str(a.get("id"))
                severity     = a.get("sev", "Warning")
                raw_severity = a.get("rawSev") or severity
                params_common = (
                    bool(a.get("thresholdMatched")),
                    a.get("thresholdId"), a.get("thresholdVal"),
                    a.get("thresholdUnit"), a.get("thresholdSev"),
                )

                await cur.execute(
                    """
                    SELECT id, status, severity, acknowledged_at
                    FROM alert_log
                    WHERE resource_id = %s AND alert_ext_id = %s
                    ORDER BY updated_at DESC, id DESC
                    LIMIT 1
                    """,
                    (resource_id, alert_ext_id),
                )
                latest = await cur.fetchone()

                # Re-fire timing is severity-aware: a Warning that's still
                # firing re-alerts 1 minute after acknowledgement; a Critical
                # re-alerts after 2 minutes. (Tune these for prod.)
                if severity == "Critical":
                    snooze_minutes = 2
                else:
                    snooze_minutes = 1
                is_snoozed_expired = (
                    latest
                    and latest["status"] == "acknowledged"
                    and latest["acknowledged_at"] is not None
                    and latest["acknowledged_at"] < datetime.now() - timedelta(minutes=snooze_minutes)
                )
                is_escalated = (
                    latest
                    and latest["status"] == "acknowledged"
                    and severity == "Critical"
                    and latest["severity"] != "Critical"
                )

                if latest is None:
                    # Brand new alert_ext_id never seen before — first row.
                    await conn.execute(
                        """
                        INSERT INTO alert_log (
                            resource_id, alert_ext_id, name, severity, raw_severity,
                            status, source, env,
                            threshold_matched, threshold_id, threshold_val, threshold_unit, threshold_severity,
                            fired_at, updated_at
                        ) VALUES (%s,%s,%s,%s,%s,'active',%s,%s,%s,%s,%s,%s,%s, NOW(), NOW())
                        """,
                        (resource_id, alert_ext_id, a.get("name", ""), severity, raw_severity,
                         a.get("source", ""), a.get("env", ""), *params_common),
                    )

                elif latest["status"] == "acknowledged" and (is_snoozed_expired or is_escalated):
                    # Snooze expired or got worse while snoozed — this is a
                    # genuinely new occurrence. Append a fresh row; the
                    # acknowledged row above is left exactly as it was.
                    await conn.execute(
                        """
                        INSERT INTO alert_log (
                            resource_id, alert_ext_id, name, severity, raw_severity,
                            status, source, env,
                            threshold_matched, threshold_id, threshold_val, threshold_unit, threshold_severity,
                            fired_at, updated_at
                        ) VALUES (%s,%s,%s,%s,%s,'active',%s,%s,%s,%s,%s,%s,%s, NOW(), NOW())
                        """,
                        (resource_id, alert_ext_id, a.get("name", ""), severity, raw_severity,
                         a.get("source", ""), a.get("env", ""), *params_common),
                    )

                elif latest["status"] == "acknowledged":
                    # Still within the snooze window — leave the acknowledged
                    # row alone entirely (don't even bump updated_at, or the
                    # snooze-expiry check above would never fire since it
                    # also reads acknowledged_at relative to "now", which is
                    # unaffected — but leaving updated_at untouched keeps the
                    # row's timeline honest: "last touched when acknowledged").
                    pass

                else:
                    # Same ongoing active occurrence — update the existing
                    # latest row in place rather than spawning a new row
                    # every ~30s poll tick.
                    await conn.execute(
                        """
                        UPDATE alert_log
                        SET severity = %s, raw_severity = %s,
                            threshold_matched = %s, threshold_id = %s,
                            threshold_val = %s, threshold_unit = %s, threshold_severity = %s,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (severity, raw_severity, *params_common, latest["id"]),
                    )


async def acknowledge_alert_log(resource_id: str, alert_ext_id: str, user_id: int) -> bool:
    """
    Mark the LATEST row for this alert as acknowledged. Returns True if a
    row was found.

    Targets the latest row by its own id (not a blind WHERE resource_id AND
    alert_ext_id) because alert_log can now hold multiple historical rows
    per alert_ext_id — without targeting by id specifically, this would
    acknowledge every past occurrence at once instead of just the current
    one.

    Deliberately does NOT touch updated_at — that column must only ever
    reflect "the last time sync_alert_log confirmed this alert was still
    actively firing." If acknowledging bumped updated_at, the gap check in
    sync_alert_log would measure time-since-ack instead of time-since-
    last-seen-firing.

    No separate history table needed: every past acknowledgement is simply
    a previous row in alert_log, untouched and permanently visible in the
    audit log, since sync_alert_log appends a NEW row on re-fire rather
    than overwriting this one.
    """
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                UPDATE alert_log
                SET status = 'acknowledged', acknowledged_by = %s, acknowledged_at = NOW()
                WHERE id = (
                    SELECT id FROM alert_log
                    WHERE resource_id = %s AND alert_ext_id = %s
                    ORDER BY updated_at DESC
                    LIMIT 1
                )
                """,
                (user_id, resource_id, str(alert_ext_id)),
            )
            return cur.rowcount > 0


async def get_acknowledged_alert_ids(resource_id: str) -> list:
    """
    Return alert_ext_ids whose LATEST row is currently acknowledged for a
    resource. Used by the frontend to suppress acknowledged alerts from the
    active view/badge across page loads.

    Must check only the latest row per alert_ext_id, not just "any row with
    status='acknowledged'" — alert_log can hold older acknowledged rows
    from past occurrences (kept as permanent history), and those must not
    keep marking the alert as acknowledged after a newer active row exists.
    """
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT DISTINCT ON (alert_ext_id) alert_ext_id, status
                FROM alert_log
                WHERE resource_id = %s
                ORDER BY alert_ext_id, updated_at DESC, id DESC
                """,
                (resource_id,),
            )
            rows = await cur.fetchall()
            return [r[0] for r in rows if r[1] == "acknowledged"]


async def get_alert_log(resource_id: str, limit: int = 100, offset: int = 0) -> list:
    """Return paginated alert audit log for a resource, newest first."""
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT al.*, u.username AS acknowledged_by_name
                FROM alert_log al
                LEFT JOIN users u ON u.id = al.acknowledged_by
                WHERE al.resource_id = %s
                ORDER BY al.fired_at DESC
                LIMIT %s OFFSET %s
                """,
                (resource_id, limit, offset),
            )
            rows = await cur.fetchall()
            return [
                {
                    **{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row.items()}
                }
                for row in rows
            ]



async def get_threshold_config(user_id: int, resource_id: str) -> Optional[list]:
    """Return saved threshold list for a user+resource, or None."""
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT thresholds FROM threshold_configs WHERE user_id = %s AND resource_id = %s",
                (user_id, resource_id),
            )
            row = await cur.fetchone()
            return row["thresholds"] if row else None


async def clear_threshold_acks(resource_id: str, threshold_row_id: str) -> None:
    """
    Surface a breach again when its threshold limit/severity is edited —
    an edited rule should re-alert on its next breach rather than silently
    staying snoozed under the OLD limit's acknowledgement.

    Appends a fresh 'active' row rather than mutating the latest
    acknowledged row in place — same pattern sync_alert_log's snooze-expiry
    re-fire uses. The acknowledged row is left completely untouched as
    permanent history (who acknowledged it, when, under what threshold);
    only a new row records "this metric is active again as of now."
    """
    pool = get_postgres_pool()
    alert_ext_id = f"breach-{threshold_row_id}-{resource_id}"
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT name, severity, raw_severity, source, env,
                       threshold_matched, threshold_id, threshold_val, threshold_unit, threshold_severity, status
                FROM alert_log
                WHERE resource_id = %s AND alert_ext_id = %s
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (resource_id, alert_ext_id),
            )
            latest = await cur.fetchone()

        if not latest or latest["status"] != "acknowledged":
            return  # nothing acknowledged to clear

        await conn.execute(
            """
            INSERT INTO alert_log (
                resource_id, alert_ext_id, name, severity, raw_severity,
                status, source, env,
                threshold_matched, threshold_id, threshold_val, threshold_unit, threshold_severity,
                fired_at, updated_at
            ) VALUES (%s,%s,%s,%s,%s,'active',%s,%s,%s,%s,%s,%s,%s, NOW(), NOW())
            """,
            (
                resource_id, alert_ext_id, latest["name"], latest["severity"], latest["raw_severity"],
                latest["source"], latest["env"], latest["threshold_matched"], latest["threshold_id"],
                latest["threshold_val"], latest["threshold_unit"], latest["threshold_severity"],
            ),
        )


async def upsert_threshold_config(user_id: int, resource_id: str, thresholds: list) -> None:
    """
    Insert or update threshold config for a user+resource.
    For any row whose limit (val) or severity actually changed from what
    was previously saved, clears any existing acknowledgement on that
    metric's breach alert — see clear_threshold_acks for why.
    """
    pool = get_postgres_pool()

    # Compare against the previously saved config to know which rows
    # genuinely changed (not just re-saved with identical values).
    previous = await get_threshold_config(user_id, resource_id) or []
    prev_by_id = {row.get("id"): row for row in previous if isinstance(row, dict)}

    async with pool.connection() as conn:
        await conn.execute(
            """
            INSERT INTO threshold_configs (user_id, resource_id, thresholds, updated_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (user_id, resource_id)
            DO UPDATE SET thresholds = EXCLUDED.thresholds,
                          updated_at = NOW()
            """,
            (user_id, resource_id, json.dumps(thresholds)),
        )

    for row in thresholds:
        row_id = row.get("id")
        prev_row = prev_by_id.get(row_id)
        changed = prev_row is None or prev_row.get("val") != row.get("val") or prev_row.get("sev") != row.get("sev")
        if changed and row_id:
            try:
                await clear_threshold_acks(resource_id, row_id)
            except Exception as e:
                logger.warning(f"[thresholds] clear_threshold_acks failed for {row_id}: {e}")


async def get_resource_tool_config(resource_id: str) -> Optional[dict]:
    """
    Return the shared tool/exporter selection for a resource, or None if
    nothing has been configured yet. Unlike threshold_configs, this is
    NOT scoped by user_id — it represents what's actually running on the
    VM (Prometheus + node_exporter, Loki, etc.), a single shared truth
    any role can read, regardless of who configured it.
    """
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                "SELECT metrics, logs, updated_by, updated_at FROM resource_tool_configs WHERE resource_id = %s",
                (resource_id,),
            )
            row = await cur.fetchone()
            if not row:
                return None
            return {
                "metrics": row["metrics"] or {},
                "logs": row["logs"] or {},
                "updated_by": row["updated_by"],
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }


async def upsert_resource_tool_config(resource_id: str, metrics: dict, logs: dict, updated_by: int) -> None:
    """
    Insert or update the shared tool/exporter selection for a resource.
    Admin/superadmin only at the route level — this is infrastructure
    state, not a personal preference, so write access is restricted even
    though every role can read it.
    """
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        await conn.execute(
            """
            INSERT INTO resource_tool_configs (resource_id, metrics, logs, updated_by, updated_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT (resource_id)
            DO UPDATE SET metrics    = EXCLUDED.metrics,
                          logs       = EXCLUDED.logs,
                          updated_by = EXCLUDED.updated_by,
                          updated_at = NOW()
            """,
            (resource_id, json.dumps(metrics), json.dumps(logs), updated_by),
        )


async def get_all_user_sessions(user_id: int) -> list:
    """Return all sessions for a user, newest first."""
    pool = get_postgres_pool()
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute(
                """
                SELECT id, session_name, config, created_at
                FROM user_sessions
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,),
            )
            return await cur.fetchall()
