"""Load transformed ETL rows into PostgreSQL and export Power BI CSV files."""

import csv
from pathlib import Path
from typing import Any

import psycopg


SCHEMA_PATH = Path(__file__).with_name("schema_postgres.sql")


def load_postgres_warehouse(
    database_url: str, transformed: dict[str, list[dict[str, Any]]]
) -> dict[str, int]:
    with psycopg.connect(database_url) as connection:
        connection.execute(SCHEMA_PATH.read_text(encoding="utf-8"))
        cursor = connection.cursor()
        cursor.executemany(
            """
            INSERT INTO infrawatch_warehouse.dim_resource (
                source, resource_type, external_id, name, parent_external_id,
                environment, state, attributes_json
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (source, resource_type, external_id) DO UPDATE SET
                name = EXCLUDED.name,
                parent_external_id = EXCLUDED.parent_external_id,
                environment = EXCLUDED.environment,
                state = EXCLUDED.state,
                attributes_json = EXCLUDED.attributes_json
            """,
            [
                (
                    row["source"],
                    row["resource_type"],
                    row["external_id"],
                    row["name"],
                    row["parent_external_id"],
                    row["environment"],
                    row["state"],
                    row["attributes_json"],
                )
                for row in transformed["resources"]
            ],
        )
        cursor.executemany(
            """
            INSERT INTO infrawatch_warehouse.etl_run (
                run_id, source, environment, collected_at
            ) VALUES (%s, %s, %s, %s)
            ON CONFLICT (run_id, source) DO UPDATE SET
                environment = EXCLUDED.environment,
                collected_at = EXCLUDED.collected_at
            """,
            [
                (row["run_id"], row["source"], row["environment"], row["collected_at"])
                for row in transformed["runs"]
            ],
        )

        external_ids_by_source: dict[str, set[str]] = {}
        for resource in transformed["resources"]:
            external_ids_by_source.setdefault(resource["source"], set()).add(
                resource["external_id"]
            )

        resource_ids = {}
        for source, external_ids in external_ids_by_source.items():
            rows = connection.execute(
                """
                SELECT resource_key, source, resource_type, external_id
                FROM infrawatch_warehouse.dim_resource
                WHERE source = %s AND external_id = ANY(%s)
                """,
                (source, list(external_ids)),
            ).fetchall()
            resource_ids.update(
                {
                    (row[1], row[2], row[3]): row[0]
                    for row in rows
                }
            )
        fact_rows = []
        for metric in transformed["metrics"]:
            key = (
                metric["source"],
                metric["resource_type"],
                metric["external_id"],
            )
            resource_key = resource_ids.get(key)
            if resource_key is None:
                raise ValueError(
                    "Metric references an unknown resource: "
                    f"{metric['source']}/{metric['resource_type']}/"
                    f"{metric['external_id']}"
                )
            fact_rows.append(
                (
                    resource_key,
                    metric["run_id"],
                    metric["source"],
                    metric["collected_at"],
                    metric["metric_name"],
                    metric["metric_value"],
                    metric["unit"],
                )
            )
        cursor.executemany(
            """
            INSERT INTO infrawatch_warehouse.fact_metric (
                resource_key, run_id, source, collected_at,
                metric_name, metric_value, unit
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (
                resource_key, run_id, source, collected_at, metric_name
            ) DO UPDATE SET
                metric_value = EXCLUDED.metric_value,
                unit = EXCLUDED.unit
            """,
            fact_rows,
        )

    return {
        "resources_loaded": len(transformed["resources"]),
        "metrics_loaded": len(transformed["metrics"]),
        "runs_loaded": len(transformed["runs"]),
    }


def export_power_bi_postgres(database_url: str, output_dir: Path) -> dict[str, int]:
    output_dir.mkdir(parents=True, exist_ok=True)
    queries = {
        "dim_resource.csv": """
            SELECT resource_key, source, resource_type, external_id, name,
                   parent_external_id, environment, state, attributes_json::text
            FROM infrawatch_warehouse.dim_resource
            ORDER BY resource_key
        """,
        "fact_metric.csv": """
            SELECT f.resource_key, f.run_id, f.source, r.resource_type,
                   r.external_id, r.name, r.environment, f.collected_at,
                   f.metric_name, f.metric_value, f.unit
            FROM infrawatch_warehouse.fact_metric AS f
            JOIN infrawatch_warehouse.dim_resource AS r USING (resource_key)
            ORDER BY f.collected_at, f.resource_key, f.metric_name
        """,
        "etl_run.csv": """
            SELECT run_id, source, environment, collected_at
            FROM infrawatch_warehouse.etl_run
            ORDER BY collected_at
        """,
    }
    counts = {}
    with psycopg.connect(database_url) as connection:
        for filename, query in queries.items():
            cursor = connection.execute(query)
            with (output_dir / filename).open(
                "w", newline="", encoding="utf-8"
            ) as output:
                writer = csv.writer(output)
                writer.writerow([column.name for column in cursor.description])
                count = 0
                for row in cursor:
                    writer.writerow(row)
                    count += 1
                counts[filename] = count
    return counts
