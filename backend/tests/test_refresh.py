import pandas as pd

from app.db import init_db, SessionLocal
from app.models import Stock, KlineDay, KlineWeek
from app import refresh


def _fake_kline(code):
    dates = pd.date_range("2025-01-06", periods=10, freq="D")
    return pd.DataFrame({
        "date": dates,
        "open": [10.0 + i for i in range(10)],
        "close": [10.5 + i for i in range(10)],
        "high": [11.0 + i for i in range(10)],
        "low": [9.5 + i for i in range(10)],
        "volume": [1000.0] * 10,
    })


def test_stock_list_refresh_writes_stocks(db_path):
    init_db()
    refresh.reset_state()
    constituents = lambda: [
        {"code": "sz000001", "name": "平安银行", "market_cap": 5000.0},
        {"code": "sz300750", "name": "宁德时代", "market_cap": 10000.0},
    ]
    refresh.run_stock_list_refresh(constituents_fn=constituents)
    with SessionLocal() as s:
        assert s.query(Stock).count() == 2
    step = refresh.STATE["kline"].steps[0]
    assert step.status == "done"
    assert step.progress == 100


def test_stock_list_refresh_softdeletes_missing_stock(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000002", name="退市股", is_st=False, is_bj=False))
        s.commit()
    constituents = lambda: [{"code": "sz000001", "name": "平安银行", "market_cap": 5000.0}]
    refresh.run_stock_list_refresh(constituents_fn=constituents)
    with SessionLocal() as s:
        assert s.get(Stock, "sz000002").delisted_at is not None
        assert s.get(Stock, "sz000001").delisted_at is None


def test_kline_data_refresh_writes_kline(db_path):
    init_db()
    refresh.reset_state()
    # 先写入股票列表
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行"))
        s.commit()
    refresh.run_kline_data_refresh(kline_fn=_fake_kline)
    with SessionLocal() as s:
        assert s.query(KlineDay).filter_by(code="sz000001").count() == 10
        assert s.query(KlineWeek).filter_by(code="sz000001").count() >= 2
    step = refresh.STATE["kline"].steps[1]
    assert step.status == "done"
    assert step.progress == 100


def test_kline_data_refresh_marks_kline_group_done_when_both_steps_done(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行"))
        s.commit()
    # 先完成 step0
    refresh.run_stock_list_refresh(constituents_fn=lambda: [{"code": "sz000001", "name": "平安银行", "market_cap": 5000.0}])
    assert refresh.STATE["kline"].steps[0].status == "done"
    # 再完成 step1，此时 kline 整体应标记 done
    refresh.run_kline_data_refresh(kline_fn=_fake_kline)
    assert refresh.STATE["kline"].status == "done"
    assert refresh.STATE["kline"].updatedAt is not None


def test_kline_data_refresh_is_full_refetch(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行"))
        s.commit()
    refresh.run_kline_data_refresh(kline_fn=_fake_kline)
    refresh.run_kline_data_refresh(kline_fn=_fake_kline)
    with SessionLocal() as s:
        assert s.query(KlineDay).filter_by(code="sz000001").count() == 10
