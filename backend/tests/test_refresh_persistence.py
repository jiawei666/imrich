import time
import sqlite3
import threading

from app import refresh
from app.db import SessionLocal
from app.models import FinancialReport, RefreshRun


def test_persist_and_load_round_trip(client):
    """持久化 STATE 后重置内存，load 应从小表恢复出同样的进度。"""
    refresh.reset_state()
    g = refresh.STATE["fundamental"]
    g.status = "done"
    g.updatedAt = "2025-01-01 00:00:00"
    s0 = g.steps[0]
    s0.status = "done"
    s0.done = 100
    s0.total = 100
    s0.progress = 100
    s0.elapsed = "01:23"

    refresh.persist_state()
    refresh.reset_state()
    assert refresh.STATE["fundamental"].steps[0].done == 0  # 已重置

    refresh.load_state_from_db()
    restored = refresh.STATE["fundamental"]
    assert restored.status == "done"
    assert restored.updatedAt == "2025-01-01 00:00:00"
    assert restored.steps[0].done == 100
    assert restored.steps[0].progress == 100
    assert restored.steps[0].elapsed == "01:23"


def test_load_marks_leftover_running_as_error(client, monkeypatch):
    """上一个进程留下的 running（instance_id 与本进程不符）应被判为中断置 error。"""
    refresh.reset_state()
    g = refresh.STATE["kline"]
    g.status = "running"
    g.steps[1].status = "running"
    g.steps[1].progress = 42
    refresh.persist_state()  # 以当前 INSTANCE_ID 写入

    # 模拟进程重启：换一个新的世代 token
    monkeypatch.setattr(refresh, "INSTANCE_ID", "a-different-process")
    refresh.reset_state()
    refresh.load_state_from_db()

    restored = refresh.STATE["kline"]
    assert restored.status == "error"
    assert restored.steps[1].status == "error"


def test_load_keeps_running_for_same_process(client):
    """同一进程（instance_id 一致）的 running 不应被误判为中断。"""
    refresh.reset_state()
    g = refresh.STATE["kline"]
    g.status = "running"
    g.steps[1].status = "running"
    refresh.persist_state()

    refresh.reset_state()
    refresh.load_state_from_db()

    assert refresh.STATE["kline"].status == "running"


def test_load_seeds_from_data_when_table_empty(client):
    """持久表为空（新库/首次）时，load 用真实数据 seed，使空闲步骤反映已有数据。"""
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(FinancialReport(code="sz000001", report_date="2025-03-31", updated_at="2025-01-01 00:00:00"))
        s.commit()

    refresh.load_state_from_db()
    step0 = refresh.STATE["fundamental"].steps[0]
    assert step0.status == "done"
    assert step0.progress == 100


def test_snapshot_marks_stale_running_as_error(client):
    """running 且心跳超过阈值未推进 → 快照判僵死置 error。"""
    refresh.reset_state()
    g = refresh.STATE["fundamental"]
    g.status = "running"
    g.steps[0].status = "running"
    g.last_beat = time.time() - (refresh.STALE_THRESHOLD + 60)

    snap = refresh.get_status_snapshot()
    assert snap["fundamental"]["status"] == "error"
    assert snap["fundamental"]["steps"][0]["status"] == "error"


def test_snapshot_keeps_fresh_running(client):
    """running 且心跳新鲜 → 不判僵死。"""
    refresh.reset_state()
    g = refresh.STATE["fundamental"]
    g.status = "running"
    g.steps[0].status = "running"
    g.last_beat = time.time()

    snap = refresh.get_status_snapshot()
    assert snap["fundamental"]["status"] == "running"


def test_snapshot_does_not_backfill_from_data_per_call(client):
    """快照不再在热路径上 count 大表回填：空闲步骤即使库里有数据也保持 idle。"""
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(FinancialReport(code="sz000001", report_date="2025-03-31", updated_at="2025-01-01 00:00:00"))
        s.commit()

    snap = refresh.get_status_snapshot()
    assert snap["fundamental"]["steps"][0]["status"] == "idle"


def test_persist_state_waits_for_transient_sqlite_write_lock(client, db_path):
    """刷新主任务写库期间，心跳持久化应等待短暂 SQLite 写锁释放后成功落库。"""
    refresh.reset_state()
    g = refresh.STATE["fundamental"]
    g.status = "running"
    g.updatedAt = "2026-06-17 10:00:00"

    lock_conn = sqlite3.connect(db_path, timeout=1, check_same_thread=False)
    lock_conn.execute("BEGIN IMMEDIATE")

    def release_lock():
        time.sleep(6)
        lock_conn.commit()
        lock_conn.close()

    releaser = threading.Thread(target=release_lock)
    releaser.start()
    try:
        refresh.persist_state()
    finally:
        releaser.join()

    with SessionLocal() as s:
        run = s.get(RefreshRun, "fundamental")
        assert run is not None
        assert run.status == "running"
        assert run.updated_at == "2026-06-17 10:00:00"
