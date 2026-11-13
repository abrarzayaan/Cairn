import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from api.main import api_app  # noqa: E402


@pytest.fixture
def api_client():
    return TestClient(api_app)
