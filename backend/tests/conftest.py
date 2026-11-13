import pytest
from fastapi.testclient import TestClient

from api.main import api_app


@pytest.fixture
def api_client():
    return TestClient(api_app)

