#!/usr/bin/env python3
"""Transform staged VMware/Morpheus snapshots into a Power BI warehouse."""

import argparse
import json
from pathlib import Path

from extract import SnapshotError, load_snapshots
from load import export_power_bi, load_warehouse
from transform import transform_snapshots


def run(input_dir: Path, database_path: Path, csv_dir: Path) -> dict:
    snapshots = load_snapshots(input_dir)
    transformed = transform_snapshots(snapshots)
    loaded = load_warehouse(database_path, transformed)
    exports = export_power_bi(database_path, csv_dir)
    return {
        "input_snapshots": len(snapshots),
        **loaded,
        "power_bi_csv_rows": exports,
        "database": str(database_path),
        "csv_directory": str(csv_dir),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Directory with source JSON snapshots")
    parser.add_argument(
        "--database",
        type=Path,
        default=Path("output/datacenter_warehouse.sqlite"),
    )
    parser.add_argument("--csv-dir", type=Path, default=Path("output/powerbi"))
    args = parser.parse_args()

    try:
        result = run(args.input, args.database, args.csv_dir)
    except (SnapshotError, OSError, ValueError) as exc:
        parser.error(str(exc))

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
