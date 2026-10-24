"""Load transformed ETL rows into SQLite and Power BI-friendly CSV files."""

import csv
import sqlite3
from pathlib import Path
from typing import Any


SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def _connect(database_path: Path) -> sqlite3.Connection:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return connection


def load_warehouse(
    database_path: Path, transformed: dict[str, list[dict[str, Any]]]
) -> dict[str, int]:
    connection = _connect(database_path)
    try:
        with connection:
            connection.executemany(
                """
                INSERT INTO dim_resource (
                    source, resource_type, external_id, name, parent_external_id,
                    environment, state, attributes_json
                ) VALUES (
                    :source, :resource_type, :external_id, :name,
                    :parent_external_id, :environment, :state, :attributes_json
                )
                ON CONFLICT(source, resource_type, external_id) DO UPDATE SET
                    name = excluded.name,
                    parent_external_id = excluded.parent_external_id,
                    environment = excluded.environment,
                    state = excluded.state,
                    attributes_json = excluded.attributes_json
                """,
                transformed["resources"],
            )
            connection.executemany(
                """
                INSERT INTO etl_run (run_id, source, environment, collected_at)
                VALUES (:run_id, :source, :environment, :collected_at)
                ON CONFLICT(run_id, source) DO UPDATE SET
                    environment = excluded.environment,
                    collected_at = excluded.collected_at
                """,
                transformed["runs"],
            )

            fact_rows = []
            for metric in transformed["metrics"]:
                resource = connection.execute(
                    """
                    SELECT resource_key FROM dim_resource
                    WHERE source = ? AND resource_type = ? AND external_id = ?
                    """,
                    (
                        metric["source"],
                        metric["resource_type"],
                        metric["external_id"],
                    ),
                ).fetchone()
                if resource is None:
                    raise ValueError(
                        "Metric references an unknown resource: "
                        f"{metric['source']}/{metric['resource_type']}/"
                        f"{metric['external_id']}"
                    )
                fact_rows.append(
                    (
                        resource[0],
                        metric["run_id"],
                        metric["source"],
                        metric["collected_at"],
                        metric["metric_name"],
                        metric["metric_value"],
                        metric["unit"],
                    )
                )
            connection.executemany(
                """
                INSERT OR REPLACE INTO fact_metric (
                    resource_key, run_id, source, collected_at,
                    metric_name, metric_value, unit
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                fact_rows,
            )

        return {
            "resources_loaded": len(transformed["resources"]),
            "metrics_loaded": len(transformed["metrics"]),
            "runs_loaded": len(transformed["runs"]),
        }
    finally:
        connection.close()


def export_power_bi(database_path: Path, output_dir: Path) -> dict[str, int]:
    output_dir.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    queries = {
        "dim_resource.csv": (
            "SELECT resource_key, source, resource_type, external_id, name, "
            "parent_external_id, environment, state, attributes_json "
            "FROM dim_resource ORDER BY resource_key"
        ),
        "fact_metric.csv": (
            "SELECT f.resource_key, f.run_id, f.source, r.resource_type, "
            "r.external_id, r.name, r.environment, f.collected_at, "
            "f.metric_name, f.metric_value, f.unit "
            "FROM fact_metric f JOIN dim_resource r USING (resource_key) "
            "ORDER BY f.collected_at, f.resource_key, f.metric_name"
        ),
        "etl_run.csv": (
            "SELECT run_id, source, environment, collected_at "
            "FROM etl_run ORDER BY collected_at"
        ),
    }
    counts = {}
    try:
        for filename, query in queries.items():
            rows = connection.execute(query)
            with (output_dir / filename).open(
                "w", newline="", encoding="utf-8"
            ) as output:
                writer = csv.writer(output)
                writer.writerow([column[0] for column in rows.description])
                count = 0
                for row in rows:
                    writer.writerow(tuple(row))
                    count += 1
                counts[filename] = count
    finally:
        connection.close()
    return counts
