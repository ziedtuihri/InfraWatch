#!/usr/bin/env python3
"""Transform staged VMware/Morpheus snapshots into a Power BI warehouse."""

import argparse
import json
import os
from pathlib import Path

from extract import SnapshotError, load_snapshots
from load import export_power_bi, load_warehouse
from transform import transform_snapshots


def run(
    input_dir: Path,
    database_path: Path,
    csv_dir: Path,
    postgresql_url: str | None = None,
) -> dict:
    snapshots = load_snapshots(input_dir)
    transformed = transform_snapshots(snapshots)
    if postgresql_url:
        from load_postgres import export_power_bi_postgres, load_postgres_warehouse

        loaded = load_postgres_warehouse(postgresql_url, transformed)
        exports = export_power_bi_postgres(postgresql_url, csv_dir)
        warehouse = "PostgreSQL schema infrawatch_warehouse"
    else:
        loaded = load_warehouse(database_path, transformed)
        exports = export_power_bi(database_path, csv_dir)
        warehouse = str(database_path)

    return {
        "input_snapshots": len(snapshots),
        **loaded,
        "power_bi_csv_rows": exports,
        "warehouse": warehouse,
        "csv_directory": str(csv_dir),
        **({"database": str(database_path)} if not postgresql_url else {}),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Directory with source JSON snapshots")
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("output/datacenter_warehouse.sqlite"),
        help="SQLite warehouse path (used unless --postgresql-url is set)",
    )
    parser.add_argument(
        "--postgresql-url",
        default=os.environ.get("WAREHOUSE_DATABASE_URL"),
        help=(
            "Optional PostgreSQL connection URL; can also be set with "
            "WAREHOUSE_DATABASE_URL"
        ),
    )
    parser.add_argument("--csv-dir", type=Path, default=Path("output/powerbi"))
    args = parser.parse_args()

    if args.postgresql_url:
        try:
            from psycopg import Error as PostgresError
        except ImportError:
            parser.error(
                "PostgreSQL mode requires psycopg; install ETL dependencies with "
                "'python -m pip install -r requirements.txt'"
            )
        error_types = (SnapshotError, OSError, ValueError, PostgresError)
    else:
        error_types = (SnapshotError, OSError, ValueError)

    try:
        result = run(args.input, args.database, args.csv_dir, args.postgresql_url)
    except error_types as exc:
        parser.error(str(exc))

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
