# InfraWatch architecture

This document describes the architecture represented by the current source
code and deployment files. It separates the application's logical components
from the hosts, containers, and external systems that run them. Solid arrows
show data or control flows; dashed arrows indicate optional or configuration-
dependent integrations.

## Logical architecture

```mermaid
flowchart TB
    Operator[Operator / administrator]
    Browser[Web browser]

    subgraph UI["Presentation layer"]
        React[React portal<br/>Vite development server or static build]
        Views[Dashboard, alerts, logs, malware analysis,<br/>VM analysis, notifications, RBAC]
        React --> Views
    end

    subgraph App["Application layer"]
        API[FastAPI application<br/>/api/v1]
        Auth[Authentication, RBAC,<br/>user config and sessions]
        Resource[Infrastructure resource,<br/>task and alert operations]
        Observability[Grafana, Loki and<br/>VM metrics adapters]
        Malware[Malware scanner and<br/>in-memory scheduler]
        Outage[VM outage analysis]
        API --> Auth
        API --> Resource
        API --> Observability
        API --> Malware
        API --> Outage
    end

    subgraph Data["Persistence and model artifacts"]
        AppDB[(PostgreSQL<br/>users, config, sessions,<br/>notifications and app data)]
        MalwareModel[(Malware model artifact)]
        OutageModel[(Outage model artifact)]
    end

    subgraph Providers["Infrastructure and observability providers"]
        Morpheus[Morpheus API]
        Docker[Docker daemon<br/>running VM containers]
        Grafana[Grafana]
        Metrics[Prometheus or VictoriaMetrics]
        Loki[Loki]
    end

    Operator --> Browser
    Browser --> React
    Views -->|HTTPS/API requests| API
    Browser -->|embedded dashboard| Grafana
    Auth --> AppDB
    Resource -->|authenticated API calls| Morpheus
    Observability --> Grafana
    Observability --> Loki
    Grafana --> Metrics
    Malware -->|container inventory and file reads| Docker
    Malware --> MalwareModel
    Malware -->|detection notifications| AppDB
    Outage -->|container CPU and memory| Docker
    Outage --> OutageModel

    subgraph ETL["Independent inventory and analytics workflow"]
        Collect[Ansible and Python collectors]
        Snapshots[Versioned JSON snapshots]
        Transform[Extract, normalize and transform]
        Warehouse[(SQLite warehouse or<br/>PostgreSQL infrawatch_warehouse)]
        CSV[Power BI CSV exports]
        Collect --> Snapshots --> Transform
        Transform --> Warehouse
        Transform --> CSV
    end

    VCenter[vCenter / ESXi]
    Morpheus -. optional inventory collection .-> Collect
    VCenter -. read-only collection .-> Collect
    Warehouse -. reporting .-> BI[Power BI or another BI consumer]
    CSV -. reporting .-> BI

    subgraph MLOps["Independent model training and logging workflow"]
        Dataset[Training datasets]
        Train[Training and evaluation scripts]
        MLflow[MLflow tracking UI / registry]
        Artifact[Versioned model artifacts]
        Logs[Logstash]
        ES[(Elasticsearch)]
        Kibana[Kibana]
        Dataset --> Train
        Train -->|runs, metrics and artifacts| MLflow
        Train --> Artifact
        Logs --> ES --> Kibana
        Train -. application and training logs .-> Logs
    end

    Artifact -. deployed as read-only files .-> MalwareModel
    Artifact -. deployed as read-only files .-> OutageModel
```

### Logical responsibilities and flows

1. The browser renders the React portal and calls the FastAPI `/api/v1`
   endpoints for authentication, resource operations, dashboards, alerts,
   logs, notifications, VM metrics, and malware/outage analysis.
2. FastAPI reads and writes application data in PostgreSQL, calls the
   configured Morpheus API, uses Grafana for dashboard/datasource resolution,
   and queries Loki for log views. Embedded Grafana dashboards query their
   configured Prometheus or VictoriaMetrics datasource.
3. VM metrics and malware analysis use the Docker daemon. Malware scanning
   reads selected running containers, scores files with a mounted model, and
   writes detected-file notifications to PostgreSQL. Recurring schedules are
   held in backend process memory and are lost when that process restarts.
4. ETL is a separate batch workflow: Ansible/Python collection produces JSON
   snapshots, Python transforms and loads them into either SQLite or the
   `infrawatch_warehouse` PostgreSQL schema, and exports CSV files for BI use.
   It does not currently feed the FastAPI request path.
5. Model training is also separate from API request handling. Training scripts
   can record experiments and artifacts in MLflow; deployment copies or mounts
   approved files into the backend. The MLOps FastAPI service and MLflow
   tracking service are distinct from the main FastAPI application.

## Physical / deployment architecture

```mermaid
flowchart LR
    User[Operator workstation]
    Browser[Browser]
    User --> Browser

    subgraph WebHost["Frontend host"]
        Vite[Vite dev server<br/>default port 5175]
        Static[Production static files<br/>served by web server / CDN]
    end
    Browser -->|development| Vite
    Browser -->|production| Static

    subgraph BackendHost["Backend host / Docker deployment"]
        FastAPI[FastAPI container or process<br/>Compose publishes 8000:8000;<br/>application defaults to 8001]
        PG[(PostgreSQL service<br/>DATABASE_URL)]
        DockerDaemon[Host Docker daemon<br/>/var/run/docker.sock]
        MalwareFile[(Read-only malware model file)]
        OutageFile[(Read-only outage model directory)]
        FastAPI --> PG
        FastAPI -->|Docker SDK socket| DockerDaemon
        FastAPI --> MalwareFile
        FastAPI --> OutageFile
    end

    Vite -->|configured proxy / API URL| FastAPI
    Static -->|configured API URL| FastAPI

    subgraph InfraHost["Infrastructure / observability environment"]
        Morpheus[Morpheus API endpoint]
        Grafana[Grafana<br/>commonly port 3000]
        Prom[Prometheus or VictoriaMetrics]
        Loki[Loki<br/>commonly port 3100]
        VMContainers[Managed VM containers]
    end
    FastAPI -->|HTTPS / configured credentials| Morpheus
    FastAPI --> Grafana
    FastAPI --> Loki
    Browser -->|Grafana dashboard embed| Grafana
    Grafana --> Prom
    DockerDaemon --> VMContainers

    subgraph ETLHost["ETL controller (run on demand)"]
        Ansible[Ansible playbooks]
        Collector[Python collectors and transforms]
        SnapDir[(JSON snapshots)]
        LocalWH[(SQLite warehouse<br/>or configured PostgreSQL)]
        Exports[(Power BI CSV exports)]
        Ansible --> Collector --> SnapDir --> Collector
        Collector --> LocalWH
        Collector --> Exports
    end
    Ansible -->|read-only inventory/API access| VCenter[vCenter / ESXi]
    Ansible -->|read-only API access, optional| Morpheus

    subgraph MLOpsHost["MLOps Docker Compose project"]
        MLOpsAPI[MLOps FastAPI and MLflow server<br/>same mlopsapp container<br/>host ports 8000 and 5000]
        MLflowDB[(SQLite tracking DB<br/>mlflow.db)]
        MLruns[(MLflow artifacts<br/>mlruns)]
        ES[(Elasticsearch<br/>host port 9200)]
        LS[Logstash]
        Kibana[Kibana<br/>host port 5601]
        ModelVol[(Model volume)]
        LogVol[(Logs volume)]
        MLOpsAPI --> ModelVol
        MLOpsAPI --> LogVol
        MLOpsAPI --> MLflowDB
        MLOpsAPI --> MLruns
        LogVol --> LS
        LS --> ES
        ES --> Kibana
    end
    Training[Training scripts / dataset] -->|tracking requests| MLOpsAPI
    Training --> ArtifactExport[Exported model artifact files]
    ArtifactExport -. copy or mount approved artifact .-> MalwareFile
    ArtifactExport -. copy or mount approved artifact .-> OutageFile
```

The diagram is a deployment view, not a claim that all nodes are on the same
machine. The ETL workflow is invoked from a controller with network access to
the source platforms and chosen warehouse. The MLOps Compose project and the
backend Compose project are independent and are not orchestrated by a
repository-root Compose file.

## Deployment notes

- **Confirm API ports before deployment.** The FastAPI application defaults
  to port `8001`, the backend Compose file maps host/container port `8000`,
  and the MLOps Compose file also publishes `8000`. The Vite proxy defaults
  to `localhost:8001`; other frontend modules use `VITE_API_URL` (default
  `http://192.168.100.77:8005`) or an `IP_BASE`-derived `:8001` URL. These
  are deployment-specific settings and must be aligned with the actual
  backend listener and published port. The two Compose projects cannot both
  bind the same host port `8000` simultaneously without changing a mapping.
- **Treat integrations as configurable endpoints.** Morpheus, PostgreSQL,
  Grafana, Prometheus/VictoriaMetrics, and Loki are configured separately;
  their presence on one host is not required by the source layout.
- **Protect the Docker socket.** The backend Compose file mounts
  `/var/run/docker.sock`; this grants the backend powerful control over the
  host's Docker daemon. Use only on a trusted host and restrict access.
- **Persist state deliberately.** Backend PostgreSQL is external to the
  backend Compose service. Malware scan schedules are in-memory. The MLOps
  Compose stack persists Elasticsearch and application data using named
  volumes and local mounts; ETL output is written under `ETL/output/` unless
  another destination is configured.
- **Keep model production and consumption distinct.** Training/export creates
  model files; the backend consumes mounted files for inference. MLflow
  tracking/registry does not automatically promote or deploy an artifact.
- **Configure browser-facing URLs consistently.** The frontend must be able
  to reach its selected API endpoint and Grafana embed URL. In production,
  serve the built frontend and configure an appropriate reverse proxy,
  authentication, TLS, and CORS policy.
