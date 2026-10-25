#!/usr/bin/env python3
"""Create explicitly synthetic Morpheus and vCenter snapshots."""

import argparse
import json
import math
from pathlib import Path
from typing import Any


SAMPLES = {
    "vcenter.json": {
        "run_id": "sample-20261024",
        "collected_at": "2026-10-24T12:00:00+00:00",
        "source": "vmware",
        "environment": "lab-vsphere",
        "hosts": [
            {
                "name": "esxi-lab-01",
                "moid": "host-101",
                "connection_state": "connected",
                "cpu_usage_pct": 36.4,
                "memory_usage_pct": 58.2,
                "cpu_cores": 16,
                "memory_capacity_bytes": 137438953472,
            }
        ],
        "vms": [
            {
                "name": "vm-app-01",
                "moid": "vm-201",
                "power_state": "poweredOn",
                "esxi_hostname": "esxi-lab-01",
                "cpu_usage_pct": 22.5,
                "memory_usage_pct": 64.0,
                "network_rx_bytes": 10485760,
                "network_tx_bytes": 7340032,
            }
        ],
        "containers": [],
        "networks": [
            {
                "name": "dvSwitch-Lab",
                "uuid": "dvs-301",
                "network_throughput_mbps": 125.5,
            }
        ],
        "datastores": [
            {
                "name": "vsan-lab-01",
                "uuid": "datastore-401",
                "capacity": 1099511627776,
                "freeSpace": 274877906944,
                "usedSpace": 824633720832,
            }
        ],
    },
    "morpheus.json": {
        "run_id": "sample-20261024",
        "collected_at": "2026-10-24T12:00:00+00:00",
        "source": "morpheus",
        "environment": "lab-vm-essentials",
        "hosts": [
            {
                "id": 501,
                "name": "kvm-lab-01",
                "serverType": {"code": "vmHypervisor"},
                "status": "online",
                "cpuUsagePct": 47.1,
                "memoryUsagePct": 61.8,
                "cpuCount": 24,
            }
        ],
        "vms": [
            {
                "id": 601,
                "name": "vm-worker-01",
                "status": "running",
                "server": {"id": 501, "name": "kvm-lab-01"},
                "cpuPercent": 31.2,
                "memoryUsagePercent": 52.6,
                "containerDetails": [
                    {
                        "id": 701,
                        "name": "worker-api",
                        "status": "running",
                        "cpuUsagePct": 12.3,
                        "memoryUsagePct": 28.1,
                    }
                ],
            }
        ],
        "containers": [],
        "networks": [
            {
                "id": 801,
                "name": "tenant-net-lab",
                "status": "active",
                "networkThroughputMbps": 42.0,
            }
        ],
        "datastores": [
            {
                "id": 901,
                "name": "ceph-lab-01",
                "status": "online",
                "capacity": 549755813888,
                "freeSpace": 164926744166,
                "usedSpace": 384829069722,
            }
        ],
    },
}


def generate_snapshots(
    vm_count: int,
    run_id: str | None = None,
    collected_at: str = "2026-10-25T12:00:00+00:00",
) -> dict[str, dict[str, Any]]:
    """Generate deterministic synthetic snapshots with the requested VM count."""
    if vm_count < 1:
        raise ValueError("VM count must be at least 1")

    run_id = run_id or f"synthetic-{vm_count}"
    host_count = max(1, math.ceil(vm_count / 20))
    network_count = max(2, math.ceil(vm_count / 50))
    datastore_count = max(1, math.ceil(vm_count / 100))
    hosts = [
        {
            "name": f"esxi-lab-{index:03d}",
            "moid": f"host-{index:03d}",
            "connection_state": "connected",
            "cpu_usage_pct": round(20 + (index * 17 % 650) / 10, 1),
            "memory_usage_pct": round(30 + (index * 23 % 600) / 10, 1),
            "cpu_cores": 16 + (index % 4) * 8,
            "memory_capacity_bytes": (128 + (index % 4) * 64) * 1024**3,
        }
        for index in range(1, host_count + 1)
    ]
    morpheus_hosts = [
        {
            "id": 5000 + index,
            "name": f"morpheus-hypervisor-{index:03d}",
            "serverType": {"code": "vmHypervisor"},
            "status": "online",
            "cpuUsagePct": round(15 + (index * 19 % 700) / 10, 1),
            "memoryUsagePct": round(25 + (index * 29 % 650) / 10, 1),
            "cpuCount": 16 + (index % 4) * 8,
        }
        for index in range(1, host_count + 1)
    ]
    vms = []
    morpheus_vms = []
    for index in range(1, vm_count + 1):
        host_index = (index - 1) % host_count
        vm_number = 10000 + index
        cpu_pct = round(5 + (index * 13 % 850) / 10, 1)
        memory_pct = round(10 + (index * 17 % 800) / 10, 1)
        vms.append(
            {
                "name": f"vm-lab-{index:05d}",
                "moid": f"vm-{vm_number}",
                "power_state": "poweredOff" if index % 37 == 0 else "poweredOn",
                "esxi_hostname": hosts[host_index]["name"],
                "cpu_usage_pct": cpu_pct,
                "memory_usage_pct": memory_pct,
                "network_rx_bytes": 1048576 * (index * 3 % 1000),
                "network_tx_bytes": 1048576 * (index * 7 % 1000),
            }
        )
        morpheus_vms.append(
            {
                "id": 20000 + index,
                "name": f"morpheus-vm-{index:05d}",
                "status": "stopped" if index % 37 == 0 else "running",
                "server": {
                    "id": morpheus_hosts[host_index]["id"],
                    "name": morpheus_hosts[host_index]["name"],
                },
                "cpuPercent": cpu_pct,
                "memoryUsagePercent": memory_pct,
                "containerDetails": [
                    {
                        "id": 30000 + index,
                        "name": f"app-container-{index:05d}",
                        "status": "running",
                        "cpuUsagePct": round(cpu_pct / 2, 1),
                        "memoryUsagePct": round(memory_pct / 2, 1),
                    }
                ],
            }
        )

    vcenter_networks = [
        {
            "name": f"dvSwitch-lab-{index:03d}",
            "uuid": f"dvs-{index:03d}",
            "network_throughput_mbps": round(100 + index * 12.5, 1),
        }
        for index in range(1, network_count + 1)
    ]
    morpheus_networks = [
        {
            "id": 60000 + index,
            "name": f"tenant-network-{index:03d}",
            "status": "active",
            "networkThroughputMbps": round(40 + index * 7.5, 1),
        }
        for index in range(1, network_count + 1)
    ]
    vcenter_datastores = []
    morpheus_datastores = []
    for index in range(1, datastore_count + 1):
        capacity = (2 + index % 4) * 1024**4
        used = capacity * (55 + index % 30) // 100
        vcenter_datastores.append(
            {
                "name": f"vsan-lab-{index:03d}",
                "uuid": f"datastore-{index:03d}",
                "capacity": capacity,
                "freeSpace": capacity - used,
                "usedSpace": used,
            }
        )
        morpheus_datastores.append(
            {
                "id": 70000 + index,
                "name": f"ceph-lab-{index:03d}",
                "status": "online",
                "capacity": capacity,
                "freeSpace": capacity - used,
                "usedSpace": used,
            }
        )

    return {
        "vcenter.json": {
            "run_id": run_id,
            "collected_at": collected_at,
            "source": "vmware",
            "environment": "synthetic-vsphere",
            "hosts": hosts,
            "vms": vms,
            "containers": [],
            "networks": vcenter_networks,
            "datastores": vcenter_datastores,
        },
        "morpheus.json": {
            "run_id": run_id,
            "collected_at": collected_at,
            "source": "morpheus",
            "environment": "synthetic-morpheus",
            "hosts": morpheus_hosts,
            "vms": morpheus_vms,
            "containers": [],
            "networks": morpheus_networks,
            "datastores": morpheus_datastores,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--count",
        type=int,
        default=500,
        help="Number of VMs to generate for each platform (default: 500)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("sample_data"),
        help="Output directory for synthetic source snapshots",
    )
    parser.add_argument(
        "--run-id",
        help="Shared ETL run ID; defaults to synthetic-<count> for idempotent reloads",
    )
    args = parser.parse_args()
    if args.count < 1:
        parser.error("--count must be at least 1")

    args.output.mkdir(parents=True, exist_ok=True)
    snapshots = generate_snapshots(args.count, run_id=args.run_id)
    for filename, snapshot in snapshots.items():
        (args.output / filename).write_text(
            json.dumps(snapshot, indent=2) + "\n", encoding="utf-8"
        )
    print(
        f"Wrote {len(snapshots)} synthetic snapshots with {args.count} VMs "
        f"per platform to {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
