PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dim_resource (
    resource_key INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    resource_type TEXT NOT NULL CHECK (
        resource_type IN ('host', 'vm', 'container', 'network', 'storage')
    ),
    external_id TEXT NOT NULL,
    name TEXT NOT NULL,
    parent_external_id TEXT,
    environment TEXT NOT NULL,
    state TEXT,
    attributes_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE (source, resource_type, external_id)
);

CREATE TABLE IF NOT EXISTS etl_run (
    run_id TEXT NOT NULL,
    source TEXT NOT NULL,
    environment TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    PRIMARY KEY (run_id, source)
);

CREATE TABLE IF NOT EXISTS fact_metric (
    resource_key INTEGER NOT NULL REFERENCES dim_resource(resource_key),
    run_id TEXT NOT NULL,
    source TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    unit TEXT NOT NULL,
    PRIMARY KEY (resource_key, run_id, source, collected_at, metric_name),
    FOREIGN KEY (run_id, source) REFERENCES etl_run(run_id, source)
);

CREATE INDEX IF NOT EXISTS idx_fact_metric_time
    ON fact_metric (collected_at, metric_name);
CREATE INDEX IF NOT EXISTS idx_dim_resource_type
    ON dim_resource (source, resource_type, environment);
