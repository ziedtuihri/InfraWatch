from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.api.auth_routes as auth_routes
from app.api.auth_routes import router as auth_router


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(auth_router)
    return TestClient(app)


def test_notifications_requires_user_id(client):
    response = client.get("/api/v1/notifications")

    assert response.status_code == 401


def test_notifications_lists_warning_for_vm2(client, monkeypatch):
    created_at = datetime(2026, 10, 15, 14, 0, tzinfo=timezone.utc)

    async def fake_get_notifications(user_id):
        assert user_id == 7
        return [{
            "id": 1,
            "user_id": user_id,
            "type": "system",
            "severity": "warning",
            "title": "High disk usage",
            "message": "Disk usage on VM2 is very high.",
            "resource_name": "VM2",
            "source_type": "test",
            "source_id": None,
            "is_read": False,
            "created_at": created_at.isoformat(),
            "read_at": None,
        }]

    monkeypatch.setattr(auth_routes, "get_notifications", fake_get_notifications)

    response = client.get("/api/v1/notifications", headers={"X-User-Id": "7"})

    assert response.status_code == 200
    assert response.json()["notifications"][0]["message"] == "Disk usage on VM2 is very high."
    assert response.json()["notifications"][0]["severity"] == "warning"


def test_notifications_can_be_marked_read(client, monkeypatch):
    async def fake_mark_notifications_read(user_id, notification_ids):
        assert user_id == 7
        assert notification_ids == [1, 2]
        return 2

    monkeypatch.setattr(auth_routes, "mark_notifications_read", fake_mark_notifications_read)

    response = client.post(
        "/api/v1/notifications/read",
        headers={"X-User-Id": "7"},
        json={"notification_ids": [1, 2]},
    )

    assert response.status_code == 200
    assert response.json() == {"updated": 2}


def test_marking_notifications_read_requires_user_id(client):
    response = client.post(
        "/api/v1/notifications/read",
        json={"notification_ids": [1]},
    )

    assert response.status_code == 401
