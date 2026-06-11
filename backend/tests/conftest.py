import os
import tempfile

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def db_path(tmp_path):
    path = tmp_path / "test.db"
    os.environ["IMRICH_DB_PATH"] = str(path)
    yield str(path)
    os.environ.pop("IMRICH_DB_PATH", None)


@pytest.fixture()
def client(db_path):
    from app.main import app
    from app.db import init_db
    init_db()
    return TestClient(app)
