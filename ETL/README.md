# Data Center Inventory and Metrics ETL

This project collects read-only infrastructure inventory and available
performance measurements from:

- **VMware vCenter / ESXi**: virtual machines, ESXi hosts, datastores,
  distributed switches, optional standard port groups, and realtime
  performance counters.
- **HPE Morpheus VM Essentials**: servers, instances, networks, datastores,
  and container details returned with instances.

The pipeline writes source snapshots as JSON, transforms them into a SQLite
star-schema warehouse, and exports CSV tables for Power BI. It also includes
fictional sample snapshots so you can exercise the complete ETL without access
to a live data center.

> **Scope note:** VMware vSphere inventory APIs do not provide arbitrary
> in-guest container inventory. Containers are included when Morpheus returns
> them in instance details. VMware Tanzu or Kubernetes container collection
> requires a separate authorized Kubernetes API integration.

## Contents

```text
ETL/
├── ansible/                 # Local-controller collection playbooks
├── python/
│   ├── collect_morpheus.py  # Paginated Morpheus API client
│   ├── collect_vmware_metrics.py
│   ├── extract.py           # Snapshot discovery and validation
│   ├── transform.py         # Provider normalization and metric facts
│   ├── load.py              # SQLite warehouse and CSV export
│   ├── run_etl.py           # ETL command-line entry point
│   ├── generate_sample.py   # Synthetic snapshot generator
│   └── schema.sql           # Warehouse schema
├── sample_data/             # Fictional VMware and Morpheus snapshots
├── tests/                   # ETL and collector unit tests
└── requirements.txt         # Python collection dependency
```

## Quick start: synthetic data

The sample data is fictional and does not describe any real host, VM, network,
or storage device. No Ansible installation, platform account, or network
connection is needed to run the sample ETL.

Requirements: Python 3.10 or later.

```bash
cd ETL
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt

# Optional: regenerate the two fictional source snapshots.
python python/generate_sample.py

python python/run_etl.py \
  --input sample_data \
  --database output/datacenter_warehouse.sqlite \
  --csv-dir output/powerbi

python -m unittest discover -s tests -v
```

The run creates or updates a SQLite database and exports:

- `output/powerbi/dim_resource.csv`
- `output/powerbi/fact_metric.csv`
- `output/powerbi/etl_run.csv`

The ETL can be rerun against the same warehouse. Resource dimensions are
upserted and fact rows use a key containing the resource, run, timestamp, and
metric, so loading the same snapshot run again is idempotent. CSV exports
contain the warehouse data, not just the most recent run.

## Live collection prerequisites

Run Ansible and the Python scripts from the same Python environment so the
Ansible playbook and its child collector can import the required packages.
Collection is performed on the Ansible controller (`localhost`) and needs
network access to vCenter and/or Morpheus.

```bash
cd ETL
python3 -m venv .venv
source .venv/bin/activate
python -m pip install ansible -r requirements.txt
ansible-galaxy collection install -r ansible/requirements.yml
```

The collection versions are pinned in `ansible/requirements.yml`. If Ansible
prints a collection compatibility warning for your `ansible-core` version,
select a supported `ansible-core` version from the collection's compatibility
metadata before deploying to production. VMware inventory modules require
PyVmomi; `requirements.txt` installs the pinned version used by the
performance collector.

## Configure credentials and collection

Credentials are read from environment variables. Do not put passwords,
API tokens, or other secrets in playbooks, inventory, shell history, or
committed files. The collection tasks that use credentials suppress their
Ansible task output; the Morpheus collector also redacts common sensitive
field names from returned JSON before saving it. Treat snapshots and the
warehouse as sensitive infrastructure inventory regardless.

### VMware vCenter / ESXi

The account should have read-only permission to browse inventory and read
performance statistics. The controller must reach the vCenter HTTPS endpoint.

```bash
export VCENTER_HOST='vcenter.example.com'
export VCENTER_USERNAME='etl-readonly@example.com'
read -rsp 'vCenter password: ' VCENTER_PASSWORD; echo
export VCENTER_PASSWORD
export VCENTER_DATACENTER='Datacenter'
export VCENTER_ENVIRONMENT='production-vsphere'
export VCENTER_VALIDATE_CERTS=true

# Optional: comma-separated ESXi hostnames to collect standard port groups.
export VCENTER_ESXI_HOSTS='esxi01.example.com,esxi02.example.com'
```

The playbook collects VM inventory, host information, datastore capacity,
distributed switches, and (when `VCENTER_ESXI_HOSTS` is set) standard port
groups. It then queries vCenter's current 20-second performance interval for
CPU and memory usage, network receive/transmit rates, and disk read/write IOPS
for hosts and VMs.

### HPE Morpheus VM Essentials

Create an API token with read-only access to the required inventory endpoints.
The controller must be able to reach the Morpheus API URL.

```bash
export MORPHEUS_URL='https://morpheus.example.com'
read -rsp 'Morpheus API token: ' MORPHEUS_TOKEN; echo
export MORPHEUS_TOKEN
export MORPHEUS_ENVIRONMENT='production-vm-essentials'
export MORPHEUS_VALIDATE_CERTS=true

# Optional; defaults to 100 pages per endpoint.
export MORPHEUS_MAX_PAGES=100
```

The client paginates `/api/servers`, `/api/instances?details=true`,
`/api/networks`, and `/api/data-stores`. It records container details nested
under instances when present. If the maximum page limit is reached, collection
fails instead of returning an incomplete snapshot.

Morpheus inventory endpoints do not expose performance counters in every
VM Essentials release/configuration. The transformer only stores numeric
measurements actually present in the returned objects; it never invents
telemetry. If CPU, memory, network, or storage measurements are absent, those
resources will have no corresponding metric fact rows. Verify which monitoring
API and fields your installed Morpheus version supports before relying on it
for live telemetry.

### Run Ansible collection

From the `ETL/` directory, choose one source or collect both:

```bash
ANSIBLE_CONFIG=ansible/ansible.cfg \
  ansible-playbook ansible/site.yml --tags vmware

ANSIBLE_CONFIG=ansible/ansible.cfg \
  ansible-playbook ansible/site.yml --tags morpheus
```

To collect both platforms under the same run ID, set `ETL_RUN_ID` once before
running the combined command. The playbooks use this value for both snapshots;
if it is unset, each playbook generates its own timestamp-based ID.

```bash
export ETL_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
ANSIBLE_CONFIG=ansible/ansible.cfg \
  ansible-playbook ansible/site.yml --tags vmware,morpheus
```

Snapshots are written to `staging/<run-id>/`. VMware collection writes
`vcenter.json`; Morpheus collection writes `morpheus.json`. Collection is
read-only: it does not create, modify, start, stop, or delete infrastructure.
TLS certificate verification is enabled by default. Keep it enabled in
production; disabling it is appropriate only for a controlled test environment
with a known certificate issue.

## Transform and load a collected run

Pass the directory containing the completed JSON snapshot(s) to the ETL:

```bash
python python/run_etl.py \
  --input staging/<run-id> \
  --database output/datacenter_warehouse.sqlite \
  --csv-dir output/powerbi
```

The command validates snapshots, normalizes resource and metric names, loads
the warehouse, and refreshes the Power BI CSV exports. It prints a JSON summary
with the number of input snapshots, resources, metrics, runs, and exported CSV
rows.

The ETL command accepts:

| Option | Description |
| --- | --- |
| `--input` | Required directory containing one or more source JSON snapshots. |
| `--database` | SQLite warehouse path; defaults to `output/datacenter_warehouse.sqlite`. |
| `--csv-dir` | Power BI CSV output directory; defaults to `output/powerbi`. |

Raw snapshots are preserved so you can reprocess them after a transformation
change. Set an appropriate retention and access policy for `staging/`,
`output/`, and any backups; inventory names, addresses, and topology can be
sensitive.

## Warehouse and Power BI model

The schema is defined in `python/schema.sql`:

| Table | Purpose |
| --- | --- |
| `dim_resource` | One row per source/resource type/external ID, including hosts, VMs, containers, networks, and storage. Stores name, environment, state, parent ID, and selected JSON attributes. |
| `fact_metric` | Long-form measured values keyed by resource, run, timestamp, and metric name. Stores source, numeric value, and unit. |
| `etl_run` | One row per run and source, with environment and collection timestamp. |

In Power BI, import the three CSVs and create a **one-to-many** relationship
from `dim_resource[resource_key]` to `fact_metric[resource_key]`. Use
`fact_metric[metric_name]` to filter or split measures and `fact_metric[unit]`
to display units. `etl_run` can be related to `fact_metric` by the composite
`run_id` and `source` fields (or used independently for run-level reporting).
The CSV fact table also includes the resource name, type, and environment to
make simple reports possible without additional modeling.

Metric values are normalized to names such as `cpu_usage_pct`,
`memory_usage_pct`, `network_rx_kbps`, `disk_read_iops`,
`storage_capacity_bytes`, and `network_throughput_mbps`. Values retain their
units; rate metrics should not be confused with cumulative byte counters.
Additional numeric provider fields can be mapped in `python/transform.py`.

## Troubleshooting

| Symptom | Likely cause and next step |
| --- | --- |
| `ansible-playbook: command not found` | Activate the virtual environment and install Ansible as shown above. |
| VMware collection/module cannot be found | Run `ansible-galaxy collection install -r ansible/requirements.yml` in the same Ansible environment. |
| `pyVmomi is required` | Activate the environment used by Ansible and install `python -m pip install -r requirements.txt`. |
| Missing vCenter or Morpheus settings | Export the required environment variables in the same shell that runs Ansible. Do not place credentials in inventory or playbooks. |
| HTTP 401/403 from Morpheus | Check the API URL, token validity, and read permissions for all required endpoints. |
| TLS/certificate connection error | Install the trusted CA certificate on the controller. For an isolated test only, the provider's `*_VALIDATE_CERTS` setting can be disabled. |
| Morpheus page limit reached | Increase `MORPHEUS_MAX_PAGES` after confirming the API is returning expected pagination results. |
| Snapshot has no metrics | Check whether the provider response includes recognized numeric metric fields and whether the account can read performance data. Inventory can be collected without live telemetry. |
| Snapshot rejected by ETL | Confirm the input directory contains complete JSON snapshots with a `run_id`, `collected_at`, `source`, and `environment`; resource records also need a stable ID or name. |
| `community.vmware` compatibility warning | Use an `ansible-core` release supported by the pinned collection versions; check the collection metadata before upgrading either dependency. |

## Development checks

Run the test suite and Python syntax check from `ETL/`:

```bash
python -m unittest discover -s tests -v
python -m compileall -q python tests
ansible-playbook -i ansible/hosts.yml ansible/collect_vcenter.yml --syntax-check
ansible-playbook -i ansible/hosts.yml ansible/collect_morpheus.yml --syntax-check
```
