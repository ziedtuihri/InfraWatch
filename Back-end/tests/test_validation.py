"""
tests/test_validation.py
------------------------
Run from AlienDataCenter/:   pytest tests/test_validation.py -v

Covers the report's validation test cases against the real routes,
fully offline (no Postgres, no Morpheus, no Grafana needed):

  TC-URL-01..06   Morpheus URL format validation
  TC-CONN-01..05  Morpheus reachability / token check (mock transport)
  TC-API-01..06   PUT /api/v1/morpheus-config end-to-end behaviour
  TC-TPL-01..06   Grafana template ID whitelist (unit)
  TC-API-TPL-1..3 /api/v1/grafana endpoints enforcing the whitelist
"""
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.api.auth_routes as auth_routes
from app.api.auth_routes import router as auth_router
from app.api.routes import router as api_router
from app.core.validation import (
    SUPPORTED_GRAFANA_TEMPLATES,
    MorpheusCheckResult,
    ValidationError,
    check_morpheus_connection,
    validate_morpheus_url,
    validate_template_ids,
)

SUPPORTED = sorted(SUPPORTED_GRAFANA_TEMPLATES)


@pytest.fixture
def anyio_backend():
    """Run async tests on asyncio only (matches the FastAPI runtime)."""
    return "asyncio"
ADMIN = {"x-user-id": "1", "x-user-role": "admin"}
VIEWER = {"x-user-id": "2", "x-user-role": "viewer"}


@pytest.fixture()
def client():
    """App with the real routers but no lifespan -> no DB pool needed."""
    test_app = FastAPI()
    test_app.include_router(auth_router)
    test_app.include_router(api_router)
    return TestClient(test_app)


# ===========================================================================
# TC-URL: Morpheus URL format validation (unit)
# ===========================================================================
class TestMorpheusUrlFormat:
    def test_tc_url_01_valid_https_url_is_normalized(self):
        assert validate_morpheus_url("https://morpheus.lab.local:8443/some/path") == \
            "https://morpheus.lab.local:8443"

    def test_tc_url_02_valid_ip_url(self):
        assert validate_morpheus_url("https://10.202.52.94") == "https://10.202.52.94"

    def test_tc_url_03_empty_url_rejected(self):
        with pytest.raises(ValidationError) as exc:
            validate_morpheus_url("   ")
        assert exc.value.code == "url_missing"

    @pytest.mark.parametrize("bad", ["morpheus.local", "ftp://morpheus.local", "htp://x"])
    def test_tc_url_04_missing_or_wrong_scheme_rejected(self, bad):
        with pytest.raises(ValidationError) as exc:
            validate_morpheus_url(bad)
        assert exc.value.code == "url_bad_scheme"

    @pytest.mark.parametrize("bad,code", [
        ("https://", "url_no_host"),
        ("https://bad_host!.com", "url_bad_host"),
        ("https://morpheus.local:99999", "url_bad_port"),
        ("https://admin:secret@morpheus.local", "url_credentials"),
    ])
    def test_tc_url_05_bad_host_port_credentials(self, bad, code):
        with pytest.raises(ValidationError) as exc:
            validate_morpheus_url(bad)
        assert exc.value.code == code

    def test_tc_url_06_error_message_is_actionable(self):
        with pytest.raises(ValidationError) as exc:
            validate_morpheus_url("not a url")
        assert "http://" in exc.value.detail


# ===========================================================================
# TC-CONN: reachability + token via httpx.MockTransport (unit, async)
# ===========================================================================
class TestMorpheusConnection:
    BASE, TOKEN = "https://morpheus.lab.local", "dummy-token"

    @pytest.mark.anyio
    async def test_tc_conn_01_ok(self):
        transport = httpx.MockTransport(lambda req: httpx.Response(200, json={"user": {}}))
        res = await check_morpheus_connection(self.BASE, self.TOKEN, _transport=transport)
        assert res.ok and res.code == "ok"

    @pytest.mark.anyio
    async def test_tc_conn_02_bad_token_401(self):
        transport = httpx.MockTransport(lambda req: httpx.Response(401))
        res = await check_morpheus_connection(self.BASE, "wrong", _transport=transport)
        assert (not res.ok) and res.code == "bad_token" and res.status_code == 401

    @pytest.mark.anyio
    async def test_tc_conn_03_unreachable(self):
        def raise_connect(req): raise httpx.ConnectError("refused", request=req)
        res = await check_morpheus_connection("https://10.255.255.1", self.TOKEN,
                                              _transport=httpx.MockTransport(raise_connect))
        assert (not res.ok) and res.code == "unreachable"
        assert "reach" in res.detail.lower()

    @pytest.mark.anyio
    async def test_tc_conn_04_timeout(self):
        def raise_timeout(req): raise httpx.ConnectTimeout("slow", request=req)
        res = await check_morpheus_connection(self.BASE, self.TOKEN,
                                              _transport=httpx.MockTransport(raise_timeout))
        assert (not res.ok) and res.code == "timeout"

    @pytest.mark.anyio
    async def test_tc_conn_05_unexpected_status(self):
        transport = httpx.MockTransport(lambda req: httpx.Response(500))
        res = await check_morpheus_connection(self.BASE, self.TOKEN, _transport=transport)
        assert (not res.ok) and res.code == "unexpected_status" and "500" in res.detail

    @pytest.mark.anyio
    async def test_tc_conn_06_token_is_sent_as_bearer(self):
        seen = {}
        def capture(req):
            seen["auth"] = req.headers.get("Authorization")
            return httpx.Response(200)
        await check_morpheus_connection(self.BASE, "tok-123",
                                        _transport=httpx.MockTransport(capture))
        assert seen["auth"] == "Bearer tok-123"


# ===========================================================================
# TC-API: PUT /api/v1/morpheus-config through the real route
# ===========================================================================
class TestMorpheusConfigEndpoint:
    def test_tc_api_01_malformed_url_rejected_422(self, client):
        r = client.put("/api/v1/morpheus-config", headers=ADMIN,
                       json={"morpheus_url": "morpheus.local", "morpheus_token": "t"})
        assert r.status_code == 422
        assert r.json()["detail"]["code"] == "url_bad_scheme"

    def test_tc_api_02_bad_token_rejected_401(self, client, monkeypatch):
        async def fake_check(url, token, verify_ssl=False, _transport=None):
            return MorpheusCheckResult(False, "bad_token", "The Morpheus API token was rejected.", 401)
        monkeypatch.setattr(auth_routes, "check_morpheus_connection", fake_check)
        r = client.put("/api/v1/morpheus-config", headers=ADMIN,
                       json={"morpheus_url": "https://morpheus.lab.local", "morpheus_token": "WRONG"})
        assert r.status_code == 401
        assert r.json()["detail"]["code"] == "bad_token"

    def test_tc_api_03_unreachable_rejected_502(self, client, monkeypatch):
        async def fake_check(url, token, verify_ssl=False, _transport=None):
            return MorpheusCheckResult(False, "unreachable", "Could not reach the Morpheus appliance.")
        monkeypatch.setattr(auth_routes, "check_morpheus_connection", fake_check)
        r = client.put("/api/v1/morpheus-config", headers=ADMIN,
                       json={"morpheus_url": "https://10.255.255.1", "morpheus_token": "t"})
        assert r.status_code == 502
        assert r.json()["detail"]["code"] == "unreachable"

    def test_tc_api_04_nothing_saved_when_rejected(self, client, monkeypatch):
        calls = []
        async def fake_upsert(*a, **k): calls.append(a)
        monkeypatch.setattr(auth_routes, "upsert_morpheus_config", fake_upsert)
        client.put("/api/v1/morpheus-config", headers=ADMIN,
                   json={"morpheus_url": "not a url", "morpheus_token": "t"})
        assert calls == []          # invalid input never reaches the database

    def test_tc_api_05_valid_config_saved_and_normalized(self, client, monkeypatch):
        saved = {}
        async def fake_check(url, token, verify_ssl=False, _transport=None):
            return MorpheusCheckResult(True, "ok", "verified", 200)
        async def fake_upsert(user_id, url, token): saved.update(url=url, token=token)
        monkeypatch.setattr(auth_routes, "check_morpheus_connection", fake_check)
        monkeypatch.setattr(auth_routes, "upsert_morpheus_config", fake_upsert)
        r = client.put("/api/v1/morpheus-config", headers=ADMIN,
                       json={"morpheus_url": "https://Morpheus.lab.local:8443/extra/path",
                             "morpheus_token": "good-token"})
        assert r.status_code == 200 and r.json()["verified"] is True
        assert saved["url"] == "https://morpheus.lab.local:8443"   # normalized before storing

    def test_tc_api_06_viewer_cannot_configure_connection(self, client):
        r = client.put("/api/v1/morpheus-config", headers=VIEWER,
                       json={"morpheus_url": "https://morpheus.lab.local", "morpheus_token": "t"})
        assert r.status_code == 403     # RBAC: Super Admin/Admin only, per the use case model


# ===========================================================================
# TC-TPL: Grafana template whitelist (unit)
# ===========================================================================
class TestGrafanaTemplateIds:
    def test_tc_tpl_01_supported_ids_accepted(self):
        assert validate_template_ids(SUPPORTED[:2]) == SUPPORTED[:2]

    def test_tc_tpl_02_string_ids_cleaned(self):
        assert validate_template_ids([f" {SUPPORTED[0]} "]) == [SUPPORTED[0]]

    def test_tc_tpl_03_unsupported_id_rejected_and_named(self):
        with pytest.raises(ValidationError) as exc:
            validate_template_ids([SUPPORTED[0], 99999])
        assert exc.value.code == "templates_unsupported"
        assert "99999" in exc.value.detail and str(SUPPORTED[0]) in exc.value.detail

    def test_tc_tpl_04_non_numeric_rejected(self):
        with pytest.raises(ValidationError) as exc:
            validate_template_ids(["node-exporter"])
        assert exc.value.code == "templates_not_numeric"

    def test_tc_tpl_05_empty_selection_rejected(self):
        with pytest.raises(ValidationError) as exc:
            validate_template_ids([])
        assert exc.value.code == "templates_missing"

    def test_tc_tpl_06_duplicates_deduplicated(self):
        assert validate_template_ids([SUPPORTED[0]] * 2) == [SUPPORTED[0]]


# ===========================================================================
# TC-API-TPL: the /grafana endpoints enforce the whitelist
# ===========================================================================
class TestGrafanaEndpoints:
    def test_tc_api_tpl_1_supported_list_endpoint(self, client):
        r = client.get("/api/v1/grafana/templates")
        assert r.status_code == 200
        ids = [row["id"] for row in r.json()]
        assert ids == SUPPORTED

    def test_tc_api_tpl_2_unsupported_template_rejected_422(self, client):
        r = client.get("/api/v1/grafana/dashboard/99999")
        assert r.status_code == 422
        detail = r.json()["detail"]
        assert detail["code"] == "templates_unsupported"
        assert "99999" in detail["message"] and str(SUPPORTED[0]) in detail["message"]

    def test_tc_api_tpl_3_supported_template_passes_whitelist(self, client, monkeypatch):
        import app.api.routes as routes
        async def fake_find(base, auth, template_id):
            return {"found": True, "uid": "abc123", "title": "Node Exporter Full",
                    "template_id": template_id}
        monkeypatch.setattr(routes, "_grafana_find_by_gnetid", fake_find)
        r = client.get(f"/api/v1/grafana/dashboard/{SUPPORTED[0]}")
        assert r.status_code == 200
        assert r.json()["found"] is True and r.json()["template_id"] == SUPPORTED[0]
