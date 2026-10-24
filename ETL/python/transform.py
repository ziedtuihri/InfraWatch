"""Normalize provider snapshots into resource dimensions and metric facts."""

import json
import math
import re
from typing import Any


METRIC_FIELDS = {
    "cpu_usage_pct": ({"cpuusagepct", "cpupercent", "cpuusagepercent"}, "percent"),
    "memory_usage_pct": (
        {"memoryusagepct", "memorypercent", "memoryusagepercent", "memusagepct"},
        "percent",
    ),
    "storage_used_bytes": (
        {"storageusedbytes", "usedspace", "usedbytes"},
        "bytes",
    ),
    "storage_free_bytes": (
        {"storagefreebytes", "freespace", "freebytes"},
        "bytes",
    ),
    "storage_capacity_bytes": (
        {"storagecapacitybytes", "capacity", "capacitybytes"},
        "bytes",
    ),
    "network_rx_bytes": ({"networkrxbytes", "receivedbytes", "rxbytes"}, "bytes"),
    "network_tx_bytes": ({"networktxbytes", "transmittedbytes", "txbytes"}, "bytes"),
    "network_throughput_mbps": (
        {"networkthroughputmbps", "throughputmbps"},
        "Mbps",
    ),
    "network_rx_kbps": ({"networkrxkbps", "receivedkbps"}, "KB/s"),
    "network_tx_kbps": ({"networktxkbps", "transmittedkbps"}, "KB/s"),
    "active_iops": ({"activeiops", "iops"}, "operations/second"),
    "disk_read_iops": ({"diskreadiops", "numberreadaveraged"}, "operations/second"),
    "disk_write_iops": ({"diskwriteiops", "numberwriteaveraged"}, "operations/second"),
    "power_consumption_watts": (
        {"powerconsumptionwatts", "powerwatts"},
        "watts",
    ),
    "cpu_cores": ({"cpucores", "numcpucores", "cpucount"}, "cores"),
    "memory_capacity_bytes": (
        {"memorycapacitybytes", "memorysizebytes"},
        "bytes",
    ),
}

ATTRIBUTE_KEYS = (
    "type",
    "serverType",
    "hypervisor",
    "cluster",
    "datacenter",
    "datastore",
    "networks",
    "powerState",
    "guestFullName",
    "ipAddress",
    "zone",
    "site",
    "statusMessage",
)


def _key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _flatten_values(value: Any, prefix: str = "") -> dict[str, Any]:
    flattened = {}
    if not isinstance(value, dict):
        return flattened
    for key, child in value.items():
        name = f"{prefix}{key}"
        if isinstance(child, dict):
            flattened.update(_flatten_values(child, name))
        elif isinstance(child, (int, float)) and not isinstance(child, bool):
            flattened[_key(name)] = child
            flattened.setdefault(_key(key), child)
    return flattened


def _iter_resources(snapshot: dict[str, Any]):
    source = str(snapshot["source"]).lower()
    environment = str(snapshot["environment"])

    for resource in snapshot.get("hosts", []):
        if isinstance(resource, dict):
            server_type = resource.get("serverType", {})
            server_code = (
                server_type.get("code", "")
                if isinstance(server_type, dict)
                else str(server_type)
            )
            code = str(server_code).lower()
            is_vm = bool(resource.get("vm")) or any(
                marker in code for marker in ("virtual machine", "vmwarevm", "virtualmachine")
            )
            yield ("vm" if is_vm else "host", resource, None)

    for resource in snapshot.get("servers", []):
        if isinstance(resource, dict):
            server_type = resource.get("serverType", {})
            server_code = (
                server_type.get("code", "")
                if isinstance(server_type, dict)
                else str(server_type)
            )
            code = str(server_code).lower()
            is_vm = bool(resource.get("vm")) or any(
                marker in code for marker in ("virtual machine", "vmwarevm", "virtualmachine")
            )
            yield ("vm" if is_vm else "host", resource, None)

    for resource in snapshot.get("vms", []):
        if isinstance(resource, dict):
            yield ("vm", resource, None)
            nested = resource.get("containerDetails") or resource.get("containers") or []
            if isinstance(nested, dict):
                nested = [nested]
            if isinstance(nested, list):
                for container in nested:
                    if isinstance(container, dict):
                        yield ("container", container, resource)

    for resource in snapshot.get("containers", []):
        if isinstance(resource, dict):
            yield ("container", resource, None)
    for resource in snapshot.get("networks", []):
        if isinstance(resource, dict):
            yield ("network", resource, None)
    for key in ("datastores", "storage"):
        for resource in snapshot.get(key, []):
            if isinstance(resource, dict):
                yield ("storage", resource, None)


def _resource_id(resource_type: str, resource: dict[str, Any]) -> str:
    for field in (
        "moid",
        "uuid",
        "externalId",
        "id",
        "name",
        "guest_name",
        "hostname",
        "host_name",
        "ansible_hostname",
        "portgroup",
    ):
        value = resource.get(field)
        if value is not None and str(value).strip():
            return str(value).strip()
    raise ValueError(f"{resource_type} resource has no stable id or name")


def _resource_name(resource: dict[str, Any], external_id: str) -> str:
    for field in (
        "name",
        "guest_name",
        "displayName",
        "hostname",
        "host_name",
        "ansible_hostname",
        "serverName",
        "portgroup",
    ):
        value = resource.get(field)
        if value is not None and str(value).strip():
            return str(value).strip()
    return external_id


def _state(resource: dict[str, Any]) -> str | None:
    for field in ("power_state", "powerState", "status", "state", "connection_state"):
        value = resource.get(field)
        if value is not None and not isinstance(value, (dict, list)):
            return str(value)
    return None


def _attributes(resource: dict[str, Any]) -> str:
    safe_attributes = {
        key: resource[key]
        for key in ATTRIBUTE_KEYS
        if key in resource and isinstance(resource[key], (str, int, float, bool, list, dict))
    }
    return json.dumps(safe_attributes, sort_keys=True, separators=(",", ":"))


def _metric_values(resource_type: str, resource: dict[str, Any]):
    values = _flatten_values(resource)
    for metric_name, (aliases, unit) in METRIC_FIELDS.items():
        if metric_name.startswith("storage_") and resource_type != "storage":
            continue
        if metric_name == "memory_capacity_bytes" and resource_type not in {"host", "vm"}:
            continue
        if metric_name == "cpu_cores" and resource_type not in {"host", "vm"}:
            continue

        for alias in aliases:
            value = values.get(alias)
            if value is None:
                continue
            numeric = float(value)
            if math.isfinite(numeric) and numeric >= 0:
                yield metric_name, numeric, unit
                break

    metrics = resource.get("metrics")
    if isinstance(metrics, list):
        for item in metrics:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", ""))
            normalized_name = _key(name)
            for metric_name, (aliases, default_unit) in METRIC_FIELDS.items():
                if normalized_name not in aliases:
                    continue
                try:
                    numeric = float(item["value"])
                except (KeyError, TypeError, ValueError):
                    break
                if math.isfinite(numeric) and numeric >= 0:
                    yield metric_name, numeric, str(item.get("unit") or default_unit)
                break


def transform_snapshots(snapshots: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    resources = {}
    facts = set()
    runs = {}

    for snapshot in snapshots:
        run_id = str(snapshot["run_id"])
        collected_at = str(snapshot["collected_at"])
        source = "vmware" if snapshot["source"] == "vcenter" else str(snapshot["source"])
        environment = str(snapshot["environment"])
        run_key = (run_id, source)
        runs[run_key] = {
            "run_id": run_id,
            "source": source,
            "environment": environment,
            "collected_at": collected_at,
        }

        for resource_type, item, parent in _iter_resources(snapshot):
            external_id = _resource_id(resource_type, item)
            name = _resource_name(item, external_id)
            parent_id = _resource_id("parent", parent) if parent else None
            key = (source, resource_type, external_id)
            resources[key] = {
                "source": source,
                "resource_type": resource_type,
                "external_id": external_id,
                "name": name,
                "parent_external_id": parent_id,
                "environment": environment,
                "state": _state(item),
                "attributes_json": _attributes(item),
            }
            for metric_name, metric_value, unit in _metric_values(resource_type, item):
                facts.add(
                    (
                        run_id,
                        source,
                        resource_type,
                        external_id,
                        collected_at,
                        metric_name,
                        metric_value,
                        unit,
                    )
                )

    return {
        "resources": list(resources.values()),
        "metrics": [
            {
                "run_id": row[0],
                "source": row[1],
                "resource_type": row[2],
                "external_id": row[3],
                "collected_at": row[4],
                "metric_name": row[5],
                "metric_value": row[6],
                "unit": row[7],
            }
            for row in sorted(facts)
        ],
        "runs": list(runs.values()),
    }
