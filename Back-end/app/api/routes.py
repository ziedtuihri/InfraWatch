from fastapi import APIRouter, Query, HTTPException, Body, Header
from app.services.external_api import (
    get_All_Instances,
    get_all_servers,
    get_instance_types,
    get_activity_list,
    get_service_plans,
    get_alerts,
    get_blueprints,
    get_apps,
    get_budgets,
    get_clients,
    get_All_Images,
    execute_task,
    make_managed,
)
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["items"])


def _uid(x_user_id: Optional[str]) -> Optional[int]:
    """Parse X-User-Id header to int, or None if absent/invalid."""
    try:
        return int(x_user_id) if x_user_id else None
    except ValueError:
        return None


@router.get("/instance-types")
async def fetch_instance_types(
    max: int = Query(1000000000),
    offset: int = Query(0),
    sort: str = Query("name"),
    direction: str = Query("asc"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        return await get_instance_types(max_items=max, offset=offset, sort=sort, direction=direction, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch instance types: {str(e)}")


@router.get("/activity")
async def fetch_activity_list(
    max: int = Query(25),
    offset: int = Query(0),
    sort: str = Query("name"),
    order: str = Query("asc"),
    timeframe: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        return await get_activity_list(max_items=max, offset=offset, sort=sort, order=order, timeframe=timeframe, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch activity list: {str(e)}")


@router.get("/service-plans")
async def fetch_service_plans(x_user_id: Optional[str] = Header(None, alias="x-user-id")):
    try:
        return await get_service_plans(user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch service plans: {str(e)}")


@router.get("/alerts")
async def fetch_alerts(
    max: int = Query(25),
    offset: int = Query(0),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        return await get_alerts(max_items=max, offset=offset, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch alerts: {str(e)}")


@router.get("/blueprints")
async def fetch_blueprints(
    max: int = Query(25),
    offset: int = Query(0),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        return await get_blueprints(max_items=max, offset=offset, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch blueprints: {str(e)}")


@router.get("/apps")
async def fetch_apps(
    max: int = Query(25),
    offset: int = Query(0),
    show_deleted: bool = Query(False),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        return await get_apps(max_items=max, offset=offset, show_deleted=show_deleted, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch apps: {str(e)}")


@router.get("/budgets")
async def fetch_budgets(
    max: int = Query(25),
    offset: int = Query(0),
    sort: str = Query("name"),
    direction: str = Query("asc"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        return await get_budgets(max_items=max, offset=offset, sort=sort, direction=direction, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch budgets: {str(e)}")


@router.get("/clients")
async def fetch_clients(
    max: int = Query(25),
    offset: int = Query(0),
    sort: str = Query("clientId"),
    direction: str = Query("asc"),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        return await get_clients(max_items=max, offset=offset, sort=sort, direction=direction, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch clients: {str(e)}")


@router.get("/AllInstances")
async def fetch_All_Instances(
    max: int = Query(25),
    offset: int = Query(0),
    show_deleted: bool = Query(False),
    details: bool = Query(False),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        return await get_All_Instances(max_items=max, offset=offset, show_deleted=show_deleted, details=details, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch all instances: {str(e)}")


@router.get("/AllServers")
async def fetch_All_Servers(
    max: int = Query(100),
    offset: int = Query(0),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        return await get_all_servers(max_items=max, offset=offset, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch all servers: {str(e)}")


@router.get("/AllImages")
async def fetch_All_Images(
    max: int = Query(25),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        return await get_All_Images(max_items=max, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch all images: {str(e)}")


@router.post("/tasks/{task_id}/execute")
async def execute_task_endpoint(
    task_id: int,
    payload: Dict[str, Any] = Body(...),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        job = payload.get("job")
        if not isinstance(job, dict):
            raise HTTPException(status_code=422, detail="Missing or invalid 'job' in request body")
        return await execute_task(task_id=task_id, job=job, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to execute task: {str(e)}")


@router.put("/servers/{server_id}/make-managed")
async def make_managed_endpoint(
    server_id: str,
    payload: Dict[str, Any] = Body(...),
    x_user_id: Optional[str] = Header(None, alias="x-user-id"),
):
    try:
        server = payload.get("server")
        if not isinstance(server, dict):
            raise HTTPException(status_code=422, detail="Missing or invalid 'server' in request body")
        ssh_host = server.get("sshHost")
        ssh_username = server.get("sshUsername")
        ssh_password = server.get("sshPassword")
        if not ssh_host or not ssh_username or not ssh_password:
            raise HTTPException(status_code=422, detail="Missing sshHost, sshUsername or sshPassword")
        install_agent = payload.get("installAgent")
        if not isinstance(install_agent, bool):
            raise HTTPException(status_code=422, detail="Missing or invalid 'installAgent' (must be boolean)")
        return await make_managed(server_id=server_id, server=server, install_agent=install_agent, user_id=_uid(x_user_id))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to make server managed: {str(e)}")


# ── Grafana dashboard resolution (server-side, no CORS) ──────────────────────

# Try localhost variants if the configured URL is the external IP (common misconfiguration)
_GRAFANA_FALLBACKS = ["http://localhost:3000", "http://127.0.0.1:3000"]

async def _grafana_find_by_gnetid(base: str, auth: tuple, template_id: int):
    """Search Grafana for a dashboard by gnetId. Returns result dict or raises on failure."""
    import httpx, asyncio
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        r = await client.get(
            f"{base}/api/search",
            params={"type": "dash-db", "limit": 1000},
            auth=auth,
        )
        r.raise_for_status()
        dashboards = r.json()

        async def check(dash):
            uid = dash.get("uid")
            if not uid:
                return None
            try:
                d = await client.get(f"{base}/api/dashboards/uid/{uid}", auth=auth)
                if d.status_code == 200:
                    data = d.json()
                    if str(data.get("dashboard", {}).get("gnetId", "")) == str(template_id):
                        return {"found": True, "uid": uid, "title": dash.get("title", ""), "template_id": template_id}
            except Exception:
                pass
            return None

        results = await asyncio.gather(*[check(d) for d in dashboards])
        for r2 in results:
            if r2:
                return r2
        return {"found": False, "template_id": template_id}


@router.get("/grafana/templates")
async def list_supported_grafana_templates():
    """Supported (air-gapped, pre-packaged) Grafana dashboard template IDs.
    The wizard uses this to constrain the dashboards step to valid IDs."""
    from app.core.validation import SUPPORTED_GRAFANA_TEMPLATES
    return [{"id": tid, "name": name} for tid, name in sorted(SUPPORTED_GRAFANA_TEMPLATES.items())]


@router.get("/grafana/dashboard/{template_id}")
async def resolve_grafana_dashboard(template_id: int):
    """
    Resolve a numeric Grafana gnetId to a dashboard uid.
    Tries the configured GRAFANA_URL first, then localhost fallbacks —
    this self-heals the common misconfiguration of setting the external IP
    instead of localhost for server-to-server backend→Grafana calls.
    """
    import httpx
    from config import settings
    from app.core.validation import SUPPORTED_GRAFANA_TEMPLATES

    # Whitelist check first: only pre-packaged template IDs are valid in the
    # air-gapped build - reject anything else before contacting Grafana.
    if template_id not in SUPPORTED_GRAFANA_TEMPLATES:
        supported = ", ".join(str(k) for k in sorted(SUPPORTED_GRAFANA_TEMPLATES))
        raise HTTPException(
            status_code=422,
            detail={
                "code": "templates_unsupported",
                "message": f"Unsupported Grafana template ID: {template_id}. "
                           f"Supported IDs in this air-gapped build: {supported}.",
            },
        )

    configured = settings.grafana_url.rstrip('/')
    auth = (settings.grafana_user, settings.grafana_password)

    urls = [configured] + [u for u in _GRAFANA_FALLBACKS if u.rstrip('/') != configured]
    last_error = "Unknown error"

    for base in urls:
        try:
            result = await _grafana_find_by_gnetid(base, auth, template_id)
            return result
        except httpx.RequestError as e:
            last_error = f"Cannot reach Grafana at {base}: {e}"
            continue
        except Exception as e:
            last_error = f"Grafana error at {base}: {e}"
            continue

    raise HTTPException(
        status_code=502,
        detail=f"Grafana unreachable. {last_error}. "
               f"Add GRAFANA_URL=http://localhost:3000 to AlienDataCenter/.env"
    )


@router.get("/grafana/datasources")
async def list_grafana_datasources():
    """
    Return all metric datasources from Grafana with their uid and url.
    Includes both Prometheus and VictoriaMetrics (PromQL-compatible, often
    registered as a prometheus-type datasource pointing at :8428). Used by
    the frontend to match a VM's IP to the right datasource uid so
    dashboards load pre-scoped to the correct instance.
    """
    import httpx
    from config import settings
    configured = settings.grafana_url.rstrip('/')
    auth = (settings.grafana_user, settings.grafana_password)
    urls = [configured] + [u for u in _GRAFANA_FALLBACKS if u.rstrip('/') != configured]
    last_error = "Unknown"
    for base in urls:
        try:
            async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
                r = await client.get(f"{base}/api/datasources", auth=auth)
                r.raise_for_status()
                return {"datasources": r.json()}
        except httpx.RequestError as e:
            last_error = str(e)
        except Exception as e:
            last_error = str(e)
    raise HTTPException(status_code=502, detail=f"Cannot reach Grafana: {last_error}")


@router.get("/grafana/ping")
async def grafana_ping():
    """Test connectivity — tries configured URL then localhost fallbacks."""
    import httpx
    from config import settings
    configured = settings.grafana_url.rstrip('/')
    auth = (settings.grafana_user, settings.grafana_password)
    urls = [configured] + [u for u in _GRAFANA_FALLBACKS if u.rstrip('/') != configured]
    tried = {}
    for url in urls:
        try:
            async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
                r = await client.get(f"{url}/api/health")
                tried[url] = {"reachable": True, "status": r.status_code}
                if r.status_code == 200:
                    return {"reachable": True, "url": url, "configured_url": configured}
        except Exception as e:
            tried[url] = {"reachable": False, "error": str(e)}
    return {
        "reachable": False,
        "configured_url": configured,
        "tried": tried,
        "fix": "Add GRAFANA_URL=http://localhost:3000 to AlienDataCenter/.env"
    }


@router.get("/grafana/targets")
async def resolve_vm_target(resource_name: str = "", resource_ip: str = "", prefer_port: str = ""):
    """
    Given a VM name and/or IP, return the matching metric datasource uid
    and the exact scrape target label (e.g. 10.202.52.57:9100).
    Called by the frontend to build correctly scoped Grafana iframe URLs.
    Uses Grafana admin credentials server-side — no CORS issues.

    prefer_port disambiguates when a host has more than one datasource on
    the same IP (VictoriaMetrics :8428 vs Prometheus :9090) — without it,
    a VM-backed resource would silently match the Prometheus datasource.
    """
    import httpx
    from config import settings

    configured = settings.grafana_url.rstrip("/")
    auth       = (settings.grafana_user, settings.grafana_password)
    urls       = [configured] + [u for u in _GRAFANA_FALLBACKS if u.rstrip("/") != configured]

    # Step 1: fetch all metric datasources.
    # VictoriaMetrics is PromQL-compatible: when registered "like Prometheus"
    # it shows up as type 'prometheus' (pointing at :8428 instead of :9090),
    # so it already passes this filter. We also accept the dedicated
    # 'victoriametrics' plugin type in case it's registered that way, so the
    # dashboard iframe resolves a datasource for a VM-backed resource either
    # way instead of silently finding nothing.
    METRIC_DS_TYPES = ("prometheus", "victoriametrics")
    datasources = []
    for base in urls:
        try:
            async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
                r = await client.get(f"{base}/api/datasources", auth=auth)
                r.raise_for_status()
                datasources = [ds for ds in r.json() if ds.get("type") in METRIC_DS_TYPES]
                break
        except Exception:
            continue

    if not datasources:
        raise HTTPException(status_code=502, detail="Cannot reach Grafana or no metric datasources")

    has_real_ip = (
        resource_ip
        and resource_ip != "0.0.0.0"
        and not resource_ip.startswith("127.")
    )

    # Step 2a: real IP — pick the datasource that actually scrapes this node.
    if has_real_ip:
        node_target = f"{resource_ip}:9100"

        # Candidate datasources whose URL contains this IP. A host can have
        # both a Prometheus (:9090) and a VictoriaMetrics (:8428) datasource
        # for the same IP, so URL-contains-IP alone is ambiguous.
        ip_matches = [ds for ds in datasources if resource_ip in (ds.get("url") or "")]

        # Order candidates so the prefer_port one (e.g. :8428 for a
        # VictoriaMetrics resource) is tried first.
        if prefer_port:
            ip_matches.sort(key=lambda ds: 0 if f":{prefer_port}" in (ds.get("url") or "") else 1)

        # Verify against live targets: query each candidate and choose the
        # first that genuinely has this node in its active targets. This is
        # the same signal the no-IP path (Step 2b) uses, and it's what makes
        # the VM case work — the Prometheus datasource has NO node_exporter
        # target for a VM-only resource, so querying it returns empty and we
        # correctly move on to the VictoriaMetrics datasource that does.
        verified = None
        for ds in ip_matches:
            ds_id = ds.get("id")
            if not ds_id:
                continue
            for base in urls:
                try:
                    async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
                        r = await client.get(
                            f"{base}/api/datasources/proxy/{ds_id}/api/v1/targets",
                            auth=auth,
                        )
                        if r.status_code != 200:
                            continue
                        active = r.json().get("data", {}).get("activeTargets", [])
                        for t in active:
                            inst = t.get("labels", {}).get("instance", "")
                            if resource_ip in inst:
                                verified = ds
                                node_target = inst or node_target
                                break
                    if verified:
                        break
                except Exception:
                    continue
            if verified:
                break

        # Preference order: a datasource we verified has the target >
        # the prefer_port URL match > any IP match > first non-localhost ds.
        prefer_match = None
        if prefer_port:
            prefer_match = next(
                (ds for ds in ip_matches if f":{prefer_port}" in (ds.get("url") or "")),
                None,
            )
        ip_only = ip_matches[0] if ip_matches else None
        fallback = next(
            (ds for ds in datasources
             if ds.get("url")
             and "localhost" not in ds["url"]
             and "127.0.0.1" not in ds["url"]),
            datasources[0],
        )
        chosen = verified or prefer_match or ip_only or fallback
        return {
            "dsUid":      chosen.get("uid"),
            "dsId":       chosen.get("id"),
            "nodeTarget": node_target,
            "matched":    "verified" if verified else "ip",
            # True only when we confirmed this node is in the datasource's
            # LIVE active targets. When False, node_target is a best-guess
            # (<ip>:9100) and the scraper may not have the target UP yet —
            # the frontend uses this to retry instead of rendering an empty
            # dashboard that needs a manual refresh.
            "verified":   bool(verified),
        }

    # Step 2b: 0.0.0.0 / no IP — query Prometheus targets server-side
    name_norm = (
        resource_name.lower()
        .replace("-", "")
        .replace("_", "")
        .replace(" ", "")
    )

    for base in urls:
        for ds in datasources:
            ds_id = ds.get("id")
            if not ds_id:
                continue
            try:
                async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
                    r = await client.get(
                        f"{base}/api/datasources/proxy/{ds_id}/api/v1/targets",
                        auth=auth,
                    )
                    if r.status_code != 200:
                        continue
                    targets = r.json().get("data", {}).get("activeTargets", [])
                    for target in targets:
                        labels   = target.get("labels", {})
                        instance = labels.get("instance", "")
                        nodename = labels.get("nodename", "")
                        norm_inst = instance.lower().replace("-","").replace("_","").replace(".","").replace(":","")
                        norm_node = nodename.lower().replace("-","").replace("_","").replace(".","")
                        if (name_norm in norm_inst
                                or name_norm in norm_node
                                or norm_inst.startswith(name_norm[:6])
                                or norm_node.startswith(name_norm[:6])):
                            return {
                                "dsUid":      ds.get("uid"),
                                "dsId":       ds_id,
                                "nodeTarget": instance,
                                "nodename":   nodename,
                                "matched":    "targets",
                                "verified":   True,
                            }
            except Exception:
                continue

    # Step 3: fallback — first non-localhost datasource, no node filter
    fallback = next(
        (ds for ds in datasources
         if ds.get("url")
         and "localhost" not in ds["url"]
         and "127.0.0.1" not in ds["url"]),
        datasources[0] if datasources else None,
    )
    return {
        "dsUid":      fallback.get("uid") if fallback else None,
        "dsId":       fallback.get("id")  if fallback else None,
        "nodeTarget": None,
        "matched":    "fallback",
        "verified":   False,
    }


@router.get("/grafana/resource-datasources")
async def resource_datasources(resource_ip: str = ""):
    """
    For a given resource IP, return one entry per metric datasource that
    actually scrapes something for this IP, including which jobs it has and
    the live instance/nodename labels.

    The frontend uses this to:
      • show a datasource (engine) button ONLY for engines that genuinely
        have the relevant job — so a blackbox dashboard configured only for
        Prometheus doesn't get a VictoriaMetrics button just because node is
        on Victoria, and vice-versa;
      • get the EXACT node target (e.g. 10.202.52.114:9100, with port) and
        the real `nodename` label, instead of guessing.

    Returns:
      { "datasources": [
          { "dsUid","dsId","url","engine","jobs":[...],
            "nodeTarget","nodename",
            "blackboxInstances":[...] }
      ] }
    """
    import httpx
    from config import settings

    configured = settings.grafana_url.rstrip("/")
    auth       = (settings.grafana_user, settings.grafana_password)
    urls       = [configured] + [u for u in _GRAFANA_FALLBACKS if u.rstrip("/") != configured]

    METRIC_DS_TYPES = ("prometheus", "victoriametrics")
    datasources = []
    for base in urls:
        try:
            async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
                r = await client.get(f"{base}/api/datasources", auth=auth)
                r.raise_for_status()
                datasources = [ds for ds in r.json() if ds.get("type") in METRIC_DS_TYPES]
                break
        except Exception:
            continue

    if not datasources:
        raise HTTPException(status_code=502, detail="Cannot reach Grafana or no metric datasources")

    def engine_of(ds):
        # Classify by URL port / type so the frontend can label the button.
        url = ds.get("url") or ""
        if ds.get("type") == "victoriametrics" or ":8428" in url:
            return "victoria"
        if ":9090" in url:
            return "prometheus"
        # Fall back on the datasource NAME convention (VictoriaMetrics-<ip>).
        name = (ds.get("name") or "").lower()
        if "victoria" in name:
            return "victoria"
        return "prometheus"

    out = []
    # Only consider datasources whose URL references this IP (the per-resource
    # ones the datasource tasks create: Prometheus-<ip> / VictoriaMetrics-<ip>).
    # Exclude any 0.0.0.0 datasource when we have a real IP — those are stale
    # entries from a resource that was provisioned without an IP, and they
    # classify to the same engine, producing duplicate buttons.
    real_ip = resource_ip and resource_ip not in ("0.0.0.0", "", None)
    ip_matches = [
        ds for ds in datasources
        if resource_ip and resource_ip in (ds.get("url") or "")
        and not (real_ip and "0.0.0.0" in (ds.get("url") or ""))
    ]
    # If none matched by URL (older single shared datasource), consider all.
    candidates = ip_matches or datasources

    for ds in candidates:
        ds_id = ds.get("id")
        if not ds_id:
            continue
        active = None
        for base in urls:
            try:
                async with httpx.AsyncClient(timeout=8.0, verify=False) as client:
                    rr = await client.get(
                        f"{base}/api/datasources/proxy/{ds_id}/api/v1/targets",
                        auth=auth,
                    )
                    if rr.status_code == 200:
                        active = rr.json().get("data", {}).get("activeTargets", [])
                        break
            except Exception:
                continue
        if active is None:
            continue

        jobs = set()
        node_target = None
        nodename = None
        blackbox_instances = []
        for t in active:
            labels = t.get("labels", {})
            job = labels.get("job", "")
            inst = labels.get("instance", "")
            if job:
                jobs.add(job)
            # node_exporter: capture the exact instance (with :9100) + nodename
            if job == "node_exporter":
                if resource_ip and resource_ip in inst:
                    node_target = inst
                    nodename = labels.get("nodename") or labels.get("hostname") or nodename
                elif node_target is None:
                    node_target = inst or node_target
                    nodename = labels.get("nodename") or labels.get("hostname") or nodename
            # blackbox: collect probe instances (the probed targets)
            if job.startswith("blackbox"):
                if inst:
                    blackbox_instances.append(inst)

        # Only include datasources that actually scrape something.
        if not jobs:
            continue

        out.append({
            "dsUid":             ds.get("uid"),
            "dsId":              ds_id,
            "url":               ds.get("url"),
            "engine":            engine_of(ds),
            "jobs":              sorted(jobs),
            "nodeTarget":        node_target,
            "nodename":          nodename,
            "blackboxInstances": blackbox_instances,
        })

    # Dedupe by engine: at most one Prometheus + one VictoriaMetrics entry.
    # If two datasources classify to the same engine, keep the one that has a
    # real node target (and the most jobs), so the frontend gets exactly one
    # button per engine instead of duplicates.
    by_engine = {}
    for d in out:
        eng = d["engine"]
        cur = by_engine.get(eng)
        if cur is None:
            by_engine[eng] = d
            continue
        cur_score = (1 if cur.get("nodeTarget") else 0, len(cur.get("jobs", [])))
        new_score = (1 if d.get("nodeTarget") else 0, len(d.get("jobs", [])))
        if new_score > cur_score:
            by_engine[eng] = d

    return {"datasources": list(by_engine.values())}


@router.get("/logs/query")
async def query_loki_logs(
    resource_ip: str = Query("", description="Resource IP (used as a host label filter)"),
    resource_name: str = Query("", description="Resource name (host label filter)"),
    loki_host: str = Query("", description="Central Loki host; defaults to the InfraWatch server"),
    query: str = Query("", description="LogQL query or free-text search"),
    level: str = Query("", description="Optional level filter: ERROR/WARN/INFO"),
    limit: int = Query(200, ge=1, le=5000),
    hours: int = Query(1, ge=1, le=168, description="Look-back window in hours"),
    port: int = Query(3100),
):
    """
    Query the CENTRAL Loki and return parsed log lines for a resource.

    Loki is centralized (one instance on the InfraWatch server, like Grafana);
    each resource's Promtail pushes logs there labelled with its host/instance.
    So we query the central Loki and filter by the resource's host label,
    rather than hitting each resource directly.
    """
    import httpx, time, re, os

    # Central Loki host: explicit param > env > the server this API runs on.
    host = (loki_host
            or os.environ.get("LOKI_HOST")
            or os.environ.get("INFRAWATCH_SERVER_IP")
            or "127.0.0.1")
    base = f"http://{host}:{port}"

    # Build a LogQL expression.
    q = (query or "").strip()
    if q.startswith("{"):
        expr = q
    else:
        # Filter to this resource's streams via the labels Promtail sets
        # (host / instance / nodename). Match any if we can't identify it.
        selectors = []
        if resource_name:
            expr = f'{{host=~"{re.escape(resource_name)}"}}'
        elif resource_ip:
            expr = f'{{instance=~"{re.escape(resource_ip)}.*"}}'
        else:
            expr = '{job=~".+"}'
        if q:
            safe = q.replace('"', '\\"')
            expr += f' |~ "(?i){safe}"'

    if level and level.upper() in ("ERROR", "WARN", "WARNING", "INFO", "DEBUG"):
        lvl = level.upper()
        lvl_re = "WARN|WARNING" if lvl.startswith("WARN") else lvl
        expr += f' |~ "(?i)\\\\b({lvl_re})\\\\b"'

    now = time.time()
    start = int((now - hours * 3600) * 1e9)
    end = int(now * 1e9)

    params = {
        "query": expr,
        "limit": str(limit),
        "start": str(start),
        "end": str(end),
        "direction": "backward",
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            r = await client.get(f"{base}/loki/api/v1/query_range", params=params)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach Loki at {base}: {e}")

    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code,
                            detail=f"Loki query failed: {r.text[:300]}")

    data = r.json().get("data", {})
    result = data.get("result", [])

    def detect_level(line: str) -> str:
        u = line.upper()
        if re.search(r"\bERROR\b|\bERR\b|\bFATAL\b|\bCRIT", u):
            return "ERROR"
        if re.search(r"\bWARN", u):
            return "WARN"
        return "INFO"

    rows = []
    for stream in result:
        labels = stream.get("stream", {})
        for value in stream.get("values", []):
            try:
                ts_ns = int(value[0])
                line = value[1]
            except (IndexError, ValueError):
                continue
            secs = ts_ns / 1e9
            tstr = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(secs))
            lvl = labels.get("level") or labels.get("detected_level") or detect_level(line)
            rows.append({
                "time": tstr,
                "ts": ts_ns,
                "level": lvl.upper() if isinstance(lvl, str) else "INFO",
                "msg": line,
                "labels": labels,
            })

    rows.sort(key=lambda x: x["ts"], reverse=True)
    rows = rows[:limit]

    sources = sorted({
        (s.get("stream", {}).get("job")
         or s.get("stream", {}).get("service_name")
         or s.get("stream", {}).get("unit")
         or s.get("stream", {}).get("filename")
         or "loki")
        for s in result
    })

    return {"logs": rows, "sources": sources, "count": len(rows), "expr": expr}
