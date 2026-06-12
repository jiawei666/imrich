import json

from app import refresh


def test_get_status_snapshot(client):
    refresh.reset_state()
    snapshot = refresh.get_status_snapshot()
    assert "kline" in snapshot
    assert "fundamental" in snapshot
    assert snapshot["kline"]["status"] == "idle"
    assert isinstance(snapshot["kline"]["steps"], list)
    assert len(snapshot["kline"]["steps"]) == 2
    assert len(snapshot["fundamental"]["steps"]) == 5
