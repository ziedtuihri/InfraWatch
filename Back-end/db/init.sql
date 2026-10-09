-- Local PostgreSQL schema

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    email VARCHAR(255),
    phone VARCHAR(50),
    notify_min_severity VARCHAR(20) NOT NULL DEFAULT 'Critical',  -- 'Warning' | 'Critical' | 'none'
    notify_email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    notify_sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Per-user, per-resource subscriptions — lets a user opt in to notifications
-- for specific VMs rather than every resource in the system. If a user has
-- zero rows here, they're treated as subscribed to ALL resources (simpler
-- default for small setups); once they add at least one explicit row,
-- it becomes an allowlist.
CREATE TABLE IF NOT EXISTS notification_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, resource_id)
);

-- Tracks which (user, alert) notifications have already been sent so the
-- same firing alert doesn't re-notify on every 30s poll — only on genuinely
-- new occurrences or severity escalations, mirroring alert_log's own
-- snooze-aware status transitions.
CREATE TABLE IF NOT EXISTS notification_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id VARCHAR(255) NOT NULL,
    alert_ext_id VARCHAR(255) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL,           -- 'email' | 'sms'
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error TEXT
);
CREATE INDEX IF NOT EXISTS idx_notification_log_lookup
    ON notification_log (user_id, resource_id, alert_ext_id, severity);

-- Morpheus connection config (one row per admin user)
CREATE TABLE IF NOT EXISTS morpheus_config (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    morpheus_url VARCHAR(500) NOT NULL,
    morpheus_token VARCHAR(500) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Wizard launch configs saved per user on Launch click
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_name VARCHAR(255),
    config JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tool/exporter selection per RESOURCE, not per user — this is "what's
-- actually running on this VM" (Prometheus + node_exporter, Loki, etc.),
-- a single shared truth. A viewer logging in for the first time has no
-- way to see what an admin already configured on a resource otherwise
-- (the wizard's toolConfig was previously only ever saved into that
-- admin's own user_sessions row, invisible to anyone else), which left
-- them unable to tell which Grafana template actually matches what's
-- collecting data on that VM.
CREATE TABLE IF NOT EXISTS resource_tool_configs (
    id SERIAL PRIMARY KEY,
    resource_id VARCHAR(255) NOT NULL UNIQUE,
    metrics JSONB NOT NULL DEFAULT '{}',
    logs JSONB NOT NULL DEFAULT '{}',
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Threshold configs saved per user per resource
CREATE TABLE IF NOT EXISTS threshold_configs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id VARCHAR(255) NOT NULL,
    thresholds JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, resource_id)
);

-- Alert audit log — every alert event per resource, with threshold linkage
-- One row per OCCURRENCE of an alert, not one row per alert. A "current
-- state" table that forced a UNIQUE(resource_id, alert_ext_id) constraint
-- meant every re-fire after acknowledgement had to overwrite the same row
-- in place — which is exactly what made "keep the old acknowledgement, but
-- also show this as newly active" impossible without either destroying
-- history or bolting on a second table. Dropping the constraint lets a
-- re-fire simply INSERT a new row: the latest row per alert_ext_id is the
-- "current state" (active alerts, badge count), and ALL rows together are
-- the full history (audit log) — one source of truth, not two tables that
-- can disagree.
CREATE TABLE IF NOT EXISTS alert_log (
    id SERIAL PRIMARY KEY,
    resource_id VARCHAR(255) NOT NULL,
    alert_ext_id VARCHAR(255) NOT NULL,
    name VARCHAR(500) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    raw_severity VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    source VARCHAR(500),
    env VARCHAR(255),
    threshold_matched BOOLEAN DEFAULT FALSE,
    threshold_id VARCHAR(50),
    threshold_val NUMERIC,
    threshold_unit VARCHAR(20),
    threshold_severity VARCHAR(50),
    acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMP,
    fired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_alert_log_lookup
    ON alert_log (resource_id, alert_ext_id, updated_at DESC);

-- Idempotent migration for existing deployments where alert_log already
-- has the old UNIQUE(resource_id, alert_ext_id) constraint from before
-- this table supported multiple rows per alert.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'alert_log'::regclass
          AND contype = 'u'
    ) THEN
        EXECUTE (
            SELECT 'ALTER TABLE alert_log DROP CONSTRAINT ' || conname
            FROM pg_constraint
            WHERE conrelid = 'alert_log'::regclass AND contype = 'u'
            LIMIT 1
        );
    END IF;
END $$;

-- alert_acknowledgements has been folded back into alert_log (see above) —
-- multiple rows per alert_ext_id now serve the same purpose this table was
-- added for. Drop it if it exists from a previous deployment.
DROP TABLE IF EXISTS alert_acknowledgements;

-- Task execution runs — tracks provisioning task progress for audit + live status
CREATE TABLE IF NOT EXISTS task_runs (
    id SERIAL PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL,             -- groups tasks launched together (one wizard run)
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resource_id VARCHAR(255) NOT NULL,
    task_id INTEGER NOT NULL,
    task_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending | running | success | failed
    detail TEXT,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_task_runs_run_id ON task_runs(run_id);

-- Idempotent migration for existing deployments where `users` already
-- existed before these columns were added — CREATE TABLE IF NOT EXISTS
-- above won't retroactively alter an existing table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_min_severity VARCHAR(20) NOT NULL DEFAULT 'Critical';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_sms_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Fix three foreign keys to users(id) that were created with no ON DELETE
-- behavior at all (defaults to NO ACTION) — meaning Postgres outright
-- rejected DELETE FROM users whenever that user had ever acknowledged an
-- alert, had a task run logged, or last touched a resource's tool
-- config. This surfaced as an unhandled 500 (no FK-violation handling in
-- delete_user), which the browser then reports as a CORS error since the
-- crash happens before the CORS middleware can attach its headers — the
-- real failure was always this constraint, not CORS. SET NULL preserves
-- the historical row; it just anonymizes who did it, which is exactly
-- the right behavior for deleting a user without destroying audit data.
-- Idempotent: looks up each constraint's actual name rather than
-- assuming Postgres's default naming convention, and does nothing if a
-- table doesn't exist yet on this deployment or the constraint is
-- already correct.
DO $$
DECLARE
    fk RECORD;
BEGIN
    FOR fk IN
        SELECT con.conname, con.conrelid::regclass::text AS tbl
        FROM pg_constraint con
        WHERE con.contype = 'f'
          AND con.confrelid = 'users'::regclass
          AND con.confdeltype = 'a'  -- 'a' = NO ACTION (the broken default)
          AND con.conrelid::regclass::text IN ('alert_log', 'task_runs', 'resource_tool_configs')
    LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', fk.tbl, fk.conname);
        IF fk.tbl = 'alert_log' THEN
            EXECUTE 'ALTER TABLE alert_log ADD CONSTRAINT alert_log_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL';
        ELSIF fk.tbl = 'task_runs' THEN
            EXECUTE 'ALTER TABLE task_runs ADD CONSTRAINT task_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL';
        ELSIF fk.tbl = 'resource_tool_configs' THEN
            EXECUTE 'ALTER TABLE resource_tool_configs ADD CONSTRAINT resource_tool_configs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL';
        END IF;
    END LOOP;
END $$;

-- 'admin' is no longer the highest tier — 'superadmin' is the only role
-- that can add users or manage other admin/superadmin accounts. Promote
-- the existing 'admin' user (the original/distinguished account) so
-- nothing is locked out by this change. If multiple admin rows exist,
-- only the oldest (lowest id) is promoted — additional pre-existing
-- admins become regular admins, matching "only the real admin" intent.
UPDATE users SET role = 'superadmin'
WHERE role = 'admin'
  AND id = (SELECT MIN(id) FROM users WHERE role = 'admin');

-- Example users: admin + viewer
-- INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin');
-- INSERT INTO users (username, password, role) VALUES ('viewer1', 'viewer123', 'viewer');
