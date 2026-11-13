import pytest


@pytest.mark.django_db
def test_health_endpoint(api_client):
    response = api_client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["db"] == "ok"


@pytest.mark.django_db
def test_home_page(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"devbook" in response.content
