#!/usr/bin/env python3
"""Add current vCenter performance samples to a VMware inventory snapshot."""

import argparse
import json
import os
import ssl
import sys
from pathlib import Path
from typing import Any


COUNTER_METRICS = {
    ("cpu", "usage", "average"): ("cpu_usage_pct", "percent"),
    ("mem", "usage", "average"): ("memory_usage_pct", "percent"),
    ("net", "received", "average"): ("network_rx_kbps", "KB/s"),
    ("net", "transmitted", "average"): ("network_tx_kbps", "KB/s"),
    ("disk", "numberReadAveraged", "average"): ("disk_read_iops", "operations/second"),
    ("disk", "numberWriteAveraged", "average"): ("disk_write_iops", "operations/second"),
}


class PerformanceCollectionError(RuntimeError):
    """Raised when vCenter performance counters cannot be queried."""


def _counter_identity(counter: Any) -> tuple[str, str, str]:
    return (
        counter.groupInfo.key,
        counter.nameInfo.key,
        counter.rollupType,
    )


def collect_performance_snapshot(hostname: str, username: str, password: str,
                                 validate_certs: bool = True) -> dict[str, Any]:
    try:
        from pyVim.connect import Disconnect, SmartConnect
        from pyVmomi import vim
    except ImportError as exc:
        raise PerformanceCollectionError(
            "pyVmomi is required; install ETL/requirements.txt"
        ) from exc

    context = ssl.create_default_context()
    if not validate_certs:
        context = ssl._create_unverified_context()

    service_instance = None
    try:
        service_instance = SmartConnect(
            host=hostname,
            user=username,
            pwd=password,
            sslContext=context,
        )
        content = service_instance.RetrieveContent()
        manager = content.perfManager
        counter_ids = {
            counter.key: COUNTER_METRICS[_counter_identity(counter)]
            for counter in manager.perfCounter
            if _counter_identity(counter) in COUNTER_METRICS
        }
        if not counter_ids:
            raise PerformanceCollectionError(
                "vCenter returned none of the requested CPU, memory, network, "
                "or disk performance counters"
            )

        view = content.viewManager.CreateContainerView(
            content.rootFolder, [vim.VirtualMachine, vim.HostSystem], True
        )
        entities = list(view.view)
        try:
            specs = [
                vim.PerformanceManager.QuerySpec(
                    entity=entity,
                    intervalId=20,
                    maxSample=1,
                    metricId=[
                        vim.PerformanceManager.MetricId(
                            counterId=counter_id, instance="*"
                        )
                        for counter_id in counter_ids
                    ],
                )
                for entity in entities
            ]
            results = manager.QueryPerf(querySpec=specs)
        finally:
            view.Destroy()

        samples = []
        for result in results or []:
            values_by_name = {}
            for series in result.value:
                mapping = counter_ids.get(series.id.counterId)
                if mapping is None or not series.value:
                    continue
                metric_name, unit = mapping
                value = sum(float(sample) for sample in series.value)
                values_by_name[metric_name] = {
                    "name": metric_name,
                    "value": value,
                    "unit": unit,
                }
            if values_by_name:
                samples.append(
                    {
                        "moid": result.entity._moId,
                        "name": result.entity.name,
                        "resource_type": (
                            "vm"
                            if isinstance(result.entity, vim.VirtualMachine)
                            else "host"
                        ),
                        "metrics": list(values_by_name.values()),
                    }
                )

        return {
            "sampled_entities": len(samples),
            "queried_entities": len(entities),
            "counter_names": sorted(
                {name for name, _unit in counter_ids.values()}
            ),
            "samples": samples,
        }
    except PerformanceCollectionError:
        raise
    except Exception as exc:
        raise PerformanceCollectionError(
            f"vCenter performance query failed: {exc}"
        ) from exc
    finally:
        if service_instance is not None:
            Disconnect(service_instance)


def enrich_snapshot(snapshot_path: Path, hostname: str, username: str,
                    password: str, validate_certs: bool = True) -> int:
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    performance = collect_performance_snapshot(
        hostname, username, password, validate_certs
    )
    by_moid = {
        resource.get("moid"): resource
        for resource_type in ("hosts", "vms")
        for resource in snapshot.get(resource_type, [])
        if resource.get("moid")
    }
    by_name = {
        resource.get("name"): resource
        for resource in snapshot.get("hosts", [])
        if resource.get("name")
    }
    for sample in performance["samples"]:
        resource = by_moid.get(sample["moid"])
        if resource is None and sample["resource_type"] == "host":
            resource = by_name.get(sample["name"])
        if resource is not None:
            resource["metrics"] = sample["metrics"]

    snapshot["performance_metrics"] = {
        key: performance[key]
        for key in ("sampled_entities", "queried_entities", "counter_names")
    }
    snapshot_path.write_text(
        json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return performance["sampled_entities"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    args = parser.parse_args()

    hostname = os.environ.get("VCENTER_HOST", "")
    username = os.environ.get("VCENTER_USERNAME", "")
    password = os.environ.get("VCENTER_PASSWORD", "")
    if not all((hostname, username, password)):
        parser.error("VCENTER_HOST, VCENTER_USERNAME, and VCENTER_PASSWORD are required")

    try:
        sampled = enrich_snapshot(
            args.snapshot,
            hostname,
            username,
            password,
            os.environ.get("VCENTER_VALIDATE_CERTS", "true").lower()
            in {"1", "true", "yes"},
        )
    except (OSError, json.JSONDecodeError, PerformanceCollectionError) as exc:
        print(f"vCenter metric collection failed: {exc}", file=sys.stderr)
        return 1

    print(f"Collected performance samples for {sampled} VMware resources")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
