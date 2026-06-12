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


def test_get_status_snapshot_is_independent_copy(client):
    """快照应是某一时刻的独立拷贝：后续 STATE 变化不应回溯修改已返回的快照，
    且两次快照在状态变化后应能被检测为不同（SSE 依赖 `snapshot != last` 判断是否推送）。"""
    refresh.reset_state()

    step2 = refresh.STATE["kline"].steps[1]
    step2.done = 100
    step2.total = 1000
    step2.progress = 10
    step2.elapsed = "00:10"

    snap1 = refresh.get_status_snapshot()
    assert snap1["kline"]["steps"][1]["elapsed"] == "00:10"

    # 模拟后台刷新任务推进进度
    step2.elapsed = "00:20"

    # 已返回的快照不应被回溯修改
    assert snap1["kline"]["steps"][1]["elapsed"] == "00:10"

    snap2 = refresh.get_status_snapshot()
    assert snap2["kline"]["steps"][1]["elapsed"] == "00:20"
    assert snap1 != snap2
