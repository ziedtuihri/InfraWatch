import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.api.routes as routes
from app.services.outage_analysis import (
    MODEL_FEATURES,
    OutageModelUnavailable,
    analyze_vm_outages,
    load_outage_model,
)
from app.api.routes import calculate_cpu_percent


class FakeModel:
    feature_names_in_ = MODEL_FEATURES
    classes_ = [0, 1]

    def predict_proba(self, features):
        assert list(features.columns) == list(MODEL_FEATURES)
        assert features.values.tolist() == [[82.0, 78.0]]
        return [[0.2, 0.8]]


def test_analysis_scores_running_vm_and_marks_stopped_vm_down():
    vms = [
        {
            "name": "VM1",
            "status": "running",
            "cpu_percent": 82,
            "memory_percent": 78,
        },
        {"name": "VM2", "status": "exited", "cpu_percent": 0, "memory_percent": 0},
    ]

    result = analyze_vm_outages(vms, FakeModel())

    assert [vm["name"] for vm in result["vms"]] == ["VM1", "VM2"]
    assert [vm["outage_probability_pct"] for vm in result["vms"]] == [80.0, 100.0]
    assert result["model"] == "Random Forest (CPU and memory)"
    assert result["generated_at"]


def test_analysis_rejects_missing_live_features():
    with pytest.raises(ValueError, match="invalid cpu_percent"):
        analyze_vm_outages([{"name": "VM1", "status": "running"}], FakeModel())


def test_cpu_percent_uses_total_host_capacity():
    stats = {
        "cpu_stats": {
            "online_cpus": 4,
            "cpu_usage": {"total_usage": 40},
            "system_cpu_usage": 400,
        },
        "precpu_stats": {
            "cpu_usage": {"total_usage": 0},
            "system_cpu_usage": 0,
        },
    }

    assert calculate_cpu_percent(stats) == 10.0


def test_load_outage_model_reports_missing_artifact(monkeypatch, tmp_path):
    monkeypatch.setenv("CLUSTER_OUTAGE_MODEL_PATH", str(tmp_path / "missing.pkl"))

    with pytest.raises(OutageModelUnavailable, match="artifact is missing"):
        load_outage_model()


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app)


def test_outage_analysis_endpoint_scores_all_containers(client, monkeypatch):
    async def fake_metrics(*, all_containers=False):
        assert all_containers is True
        return [
            {
                "name": "VM1",
                "status": "running",
                "cpu_percent": 82,
                "memory_percent": 78,
            }
        ]

    monkeypatch.setattr(routes, "get_all_vms_metrics", fake_metrics)
    monkeypatch.setattr(routes, "load_outage_model", FakeModel)

    response = client.get("/api/v1/vms/outage-analysis")

    assert response.status_code == 200
    assert response.json()["vms"][0]["outage_probability_pct"] == 80.0


def test_outage_analysis_endpoint_surfaces_missing_model(client, monkeypatch):
    async def fake_metrics(*, all_containers=False):
        return []

    def unavailable_model():
        raise OutageModelUnavailable("model not installed")

    monkeypatch.setattr(routes, "get_all_vms_metrics", fake_metrics)
    monkeypatch.setattr(routes, "load_outage_model", unavailable_model)

    response = client.get("/api/v1/vms/outage-analysis")

    assert response.status_code == 503
    assert response.json()["detail"] == "model not installed"
