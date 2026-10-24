"""Load and validate raw platform snapshots from one ETL collection run."""

import json
from pathlib import Path
from typing import Any


class SnapshotError(ValueError):
    """Raised when a staged collection snapshot is invalid."""


RESOURCE_KEYS = ("hosts", "vms", "servers", "containers", "networks", "datastores")


def load_snapshots(input_dir: Path) -> list[dict[str, Any]]:
    if not input_dir.is_dir():
        raise SnapshotError(f"Snapshot directory does not exist: {input_dir}")

    files = sorted(input_dir.glob("*.json"))
    if not files:
        raise SnapshotError(f"No JSON snapshots found in {input_dir}")

    snapshots = []
    seen_sources = set()
    for file_path in files:
        try:
            snapshot = json.loads(file_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise SnapshotError(f"Could not read snapshot {file_path}: {exc}") from exc
        if not isinstance(snapshot, dict):
            raise SnapshotError(f"Snapshot root must be a JSON object: {file_path}")

        for field in ("run_id", "collected_at", "source", "environment"):
            if not snapshot.get(field):
                raise SnapshotError(f"Snapshot {file_path} is missing {field!r}")

        source = str(snapshot["source"]).strip().lower()
        if source not in {"vmware", "vcenter", "morpheus"}:
            raise SnapshotError(f"Unsupported snapshot source {source!r}: {file_path}")
        if source in seen_sources:
            raise SnapshotError(f"Duplicate snapshot source {source!r} in {input_dir}")
        seen_sources.add(source)

        for key in RESOURCE_KEYS:
            value = snapshot.get(key, [])
            if not isinstance(value, list):
                raise SnapshotError(
                    f"Snapshot field {key!r} must be a JSON array: {file_path}"
                )
        snapshots.append(snapshot)

    return snapshots
