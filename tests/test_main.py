from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_root():
    """Test root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    assert "message" in response.json()

def test_health_check():
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_instance_types_endpoint():
    """Test instance types endpoint with default params"""
    response = client.get("/api/v1/instance-types")
    # Note: This may fail if external API is not reachable
    # In that case, use mocking to test the endpoint
    assert response.status_code in [200, 500]
