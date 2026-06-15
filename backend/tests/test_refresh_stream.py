import json
from datetime import datetime

from app import refresh
from app.db import SessionLocal
from app.models import FinancialReport, Forecast, IndustryIndex, ResearchReport


def test_get_status_snapshot(client):
    refresh.reset_state()
    snapshot = refresh.get_status_snapshot()
    assert "kline" in snapshot
    assert "fundamental" in snapshot
    assert "all" in snapshot
    assert snapshot["kline"]["status"] == "idle"
    assert isinstance(snapshot["kline"]["steps"], list)
    assert len(snapshot["kline"]["steps"]) == 2
    assert len(snapshot["fundamental"]["steps"]) == 5
    assert len(snapshot["all"]["steps"]) == 0
    assert snapshot["all"]["status"] == "idle"


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


def test_get_status_snapshot_preserves_running_step_progress_when_history_exists(client):
    """重新刷新某个基本面步骤时，即使该表已有历史数据（count > 0），
    数据库回填逻辑也不应把正在运行的步骤强行覆盖为 100%。"""
    refresh.reset_state()

    now = "2025-01-01 00:00:00"
    with SessionLocal() as s:
        s.add(FinancialReport(code="sz000001", report_date="2025-03-31", updated_at=now))
        s.add(Forecast(code="sz000001", report_date="2025-03-31", source="forecast", indicator="净利润", updated_at=now))
        s.add(IndustryIndex(code="850111", date="2025-01-02", name="银行", open=1, close=1, high=1, low=1, volume=1))
        s.add(ResearchReport(report_id="R1", code="sz000001", title="t1", published_at="2025-06-01", stage="metadata"))
        s.add(ResearchReport(report_id="R2", code="sz000002", title="t2", published_at="2025-06-01", stage="parsed"))
        s.commit()

    group = refresh.STATE["fundamental"]
    for step in group.steps:
        step.status = "running"
        step.total = 10
        step.done = 3
        step.progress = 30

    snapshot = refresh.get_status_snapshot()
    f_steps = snapshot["fundamental"]["steps"]
    for i, step in enumerate(f_steps):
        assert step["status"] == "running", f"step {i} status overwritten: {step}"
        assert step["progress"] == 30, f"step {i} progress overwritten: {step}"


def test_get_status_snapshot_backfills_idle_step_from_db(client):
    """非运行中的步骤仍应按数据库实际数据量回填进度为 100% 并标记为 done（兜底逻辑）。"""
    refresh.reset_state()

    with SessionLocal() as s:
        s.add(FinancialReport(code="sz000001", report_date="2025-03-31", updated_at="2025-01-01 00:00:00"))
        s.commit()

    snapshot = refresh.get_status_snapshot()
    step0 = snapshot["fundamental"]["steps"][0]
    assert step0["status"] == "done"
    assert step0["progress"] == 100


def test_get_status_snapshot_backfills_research_pdfs_step_reflects_remaining_pending(client):
    """进程重启等原因导致研报PDF解析的内存状态丢失重置后，
    若近一年内仍有未解析的研报，回填不应误标记为 done/100%（否则会掩盖大量未完成的解析）。"""
    refresh.reset_state()

    recent_date = datetime.now().strftime("%Y-%m-%d")
    with SessionLocal() as s:
        s.add(ResearchReport(report_id="R1", code="sz000001", title="t1", published_at=recent_date, stage="parsed"))
        for i in range(2, 5):
            s.add(ResearchReport(report_id=f"R{i}", code=f"sz00000{i}", title=f"t{i}", published_at=recent_date, stage="metadata"))
        s.commit()

    snapshot = refresh.get_status_snapshot()
    step4 = snapshot["fundamental"]["steps"][4]
    assert step4["done"] == 1
    assert step4["total"] == 4
    assert step4["progress"] == 25
    assert step4["status"] != "done"


def test_get_status_snapshot_backfills_research_pdfs_step_as_done_when_no_pending(client):
    """近一年内的研报全部解析完成时，研报PDF解析步骤回填为 done/100%。"""
    refresh.reset_state()

    recent_date = datetime.now().strftime("%Y-%m-%d")
    with SessionLocal() as s:
        s.add(ResearchReport(report_id="R1", code="sz000001", title="t1", published_at=recent_date, stage="parsed"))
        s.commit()

    snapshot = refresh.get_status_snapshot()
    step4 = snapshot["fundamental"]["steps"][4]
    assert step4["done"] == 1
    assert step4["total"] == 1
    assert step4["progress"] == 100
    assert step4["status"] == "done"
