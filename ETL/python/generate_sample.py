#!/usr/bin/env python3
"""Create small, explicitly synthetic snapshots for ETL testing."""

import argparse
import json
from pathlib import Path


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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("sample_data"),
        help="Output directory for synthetic source snapshots",
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for filename, snapshot in SAMPLES.items():
        (args.output / filename).write_text(
            json.dumps(snapshot, indent=2) + "\n", encoding="utf-8"
        )
    print(f"Wrote {len(SAMPLES)} synthetic snapshots to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
