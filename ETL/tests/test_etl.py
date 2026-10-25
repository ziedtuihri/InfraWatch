import io
import json
import sqlite3
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from pathlib import Path

from python.collect_morpheus import collect_snapshot
from python.extract import SnapshotError, load_snapshots
from python.generate_sample import SAMPLES, generate_snapshots
from python.load import export_power_bi, load_warehouse
from python.load_postgres import load_postgres_warehouse
from python.transform import transform_snapshots


class ExtractTests(unittest.TestCase):
    def test_rejects_missing_snapshot_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            missing = Path(directory) / "missing"
            with self.assertRaises(SnapshotError):
                load_snapshots(missing)

    def test_rejects_incomplete_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.json"
            path.write_text(json.dumps({"source": "vmware"}), encoding="utf-8")
            with self.assertRaisesRegex(SnapshotError, "run_id"):
                load_snapshots(Path(directory))

    def test_rejects_duplicate_platform_snapshots(self):
        with tempfile.TemporaryDirectory() as directory:
            for filename in ("one.json", "two.json"):
                (Path(directory) / filename).write_text(
                    json.dumps(SAMPLES["vcenter.json"]), encoding="utf-8"
                )
            with self.assertRaisesRegex(SnapshotError, "Duplicate"):
                load_snapshots(Path(directory))


class MorpheusCollectorTests(unittest.TestCase):
    @patch("python.collect_morpheus.urlopen")
    def test_collects_inventory_and_redacts_secret_fields(self, mock_urlopen):
        payloads = [
            {"servers": [{"id": 1, "password": "secret-value"}]},
            {"instances": [{"id": 2, "containerDetails": []}]},
            {"networks": []},
            {"datastores": [{"id": 3, "config": {"apiToken": "secret-value"}}]},
        ]
        mock_urlopen.side_effect = [
            io.BytesIO(json.dumps(payload).encode("utf-8"))
            for payload in payloads
        ]

        result = collect_snapshot(
            "https://morpheus.example",
            "api-token",
            "test-env",
            "run-1",
        )

        counts = [
            len(result[key]) for key in ("hosts", "vms", "networks", "datastores")
        ]
        self.assertEqual(counts, [1, 1, 0, 1])
        self.assertEqual(result["hosts"][0]["password"], "[REDACTED]")
        self.assertEqual(result["datastores"][0]["config"]["apiToken"], "[REDACTED]")
        request = mock_urlopen.call_args_list[0].args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer api-token")


class WarehouseTests(unittest.TestCase):
    def test_postgres_loader_upserts_resources_and_metrics(self):
        transformed = transform_snapshots([SAMPLES["vcenter.json"]])
        connection = MagicMock()
        cursor = MagicMock()
        connection.cursor.return_value = cursor
        connection.execute.side_effect = (
            lambda query, params=None: MagicMock(
                fetchall=lambda: [
                    (
                        index,
                        resource["source"],
                        resource["resource_type"],
                        resource["external_id"],
                    )
                    for index, resource in enumerate(transformed["resources"], start=1)
                    if resource["source"] == params[0]
                    and resource["external_id"] in params[1]
                ]
            )
            if params is not None
            else None
        )
        context = MagicMock()
        context.__enter__.return_value = connection

        with patch("python.load_postgres.psycopg.connect", return_value=context):
            loaded = load_postgres_warehouse(
                "postgresql://test.invalid/warehouse", transformed
            )

        self.assertEqual(loaded["resources_loaded"], len(transformed["resources"]))
        self.assertEqual(loaded["metrics_loaded"], len(transformed["metrics"]))
        self.assertEqual(loaded["runs_loaded"], 1)
        self.assertEqual(cursor.executemany.call_count, 3)

    def test_generated_snapshots_have_requested_vm_count_and_transform(self):
        snapshots = list(generate_snapshots(12).values())
        self.assertEqual([len(snapshot["vms"]) for snapshot in snapshots], [12, 12])

        morpheus = next(s for s in snapshots if s["source"] == "morpheus")
        self.assertEqual(len(morpheus["hosts"]), 1)
        self.assertEqual(len(morpheus["vms"][0]["containerDetails"]), 1)
        transformed = transform_snapshots(snapshots)
        vm_resources = [
            row for row in transformed["resources"] if row["resource_type"] == "vm"
        ]
        self.assertEqual(len(vm_resources), 24)

    def test_sample_transforms_loads_and_exports(self):
        snapshots = list(SAMPLES.values())
        transformed = transform_snapshots(snapshots)

        self.assertEqual(len(transformed["runs"]), 2)
        self.assertIn("cpu_usage_pct", {row["metric_name"] for row in transformed["metrics"]})
        self.assertIn("storage_capacity_bytes", {row["metric_name"] for row in transformed["metrics"]})
        self.assertIn("container", {row["resource_type"] for row in transformed["resources"]})

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database = root / "warehouse.sqlite"
            csv_directory = root / "powerbi"
            loaded = load_warehouse(database, transformed)
            self.assertEqual(loaded["resources_loaded"], len(transformed["resources"]))
            self.assertEqual(loaded["metrics_loaded"], len(transformed["metrics"]))

            with sqlite3.connect(database) as connection:
                run_sources = connection.execute(
                    "SELECT COUNT(*) FROM etl_run"
                ).fetchone()[0]
                fact_count = connection.execute(
                    "SELECT COUNT(*) FROM fact_metric"
                ).fetchone()[0]
            self.assertEqual(run_sources, 2)
            self.assertEqual(fact_count, len(transformed["metrics"]))

            counts = export_power_bi(database, csv_directory)
            self.assertEqual(counts["fact_metric.csv"], len(transformed["metrics"]))
            self.assertTrue((csv_directory / "dim_resource.csv").is_file())

    def test_parent_child_relationship_is_preserved(self):
        snapshots = [SAMPLES["morpheus.json"]]
        transformed = transform_snapshots(snapshots)
        vm = next(row for row in transformed["resources"] if row["resource_type"] == "vm")
        container = next(
            row for row in transformed["resources"] if row["resource_type"] == "container"
        )
        self.assertEqual(container["parent_external_id"], vm["external_id"])

    def test_reload_is_idempotent(self):
        transformed = transform_snapshots(list(SAMPLES.values()))
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "warehouse.sqlite"
            load_warehouse(database, transformed)
            load_warehouse(database, transformed)
            with sqlite3.connect(database) as connection:
                count = connection.execute(
                    "SELECT COUNT(*) FROM fact_metric"
                ).fetchone()[0]
            self.assertEqual(count, len(transformed["metrics"]))


if __name__ == "__main__":
    unittest.main()
