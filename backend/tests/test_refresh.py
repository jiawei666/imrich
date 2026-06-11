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


def test_refresh_writes_stocks_and_kline(db_path):
    init_db()
    refresh.reset_state()
    constituents = lambda: [
        {"code": "sz000001", "name": "平安银行", "market_cap": 5000.0},
        {"code": "sz300750", "name": "宁德时代", "market_cap": 10000.0},
    ]
    refresh.run_kline_refresh(constituents_fn=constituents, kline_fn=_fake_kline)
    with SessionLocal() as s:
        assert s.query(Stock).count() == 2
        assert s.query(KlineDay).filter_by(code="sz000001").count() == 10
        assert s.query(KlineWeek).filter_by(code="sz000001").count() >= 2
    assert refresh.STATE["kline"].status == "done"
    assert all(step.done == step.total for step in refresh.STATE["kline"].steps)


def test_refresh_softdeletes_missing_stock(db_path):
    init_db()
    refresh.reset_state()
    with SessionLocal() as s:
        s.add(Stock(code="sz000002", name="退市股", is_st=False, is_bj=False))
        s.commit()
    constituents = lambda: [{"code": "sz000001", "name": "平安银行", "market_cap": 5000.0}]
    refresh.run_kline_refresh(constituents_fn=constituents, kline_fn=_fake_kline)
    with SessionLocal() as s:
        assert s.get(Stock, "sz000002").delisted_at is not None
        assert s.get(Stock, "sz000001").delisted_at is None


def test_refresh_is_full_refetch(db_path):
    init_db()
    refresh.reset_state()
    constituents = lambda: [{"code": "sz000001", "name": "平安银行", "market_cap": 5000.0}]
    refresh.run_kline_refresh(constituents_fn=constituents, kline_fn=_fake_kline)
    refresh.run_kline_refresh(constituents_fn=constituents, kline_fn=_fake_kline)
    with SessionLocal() as s:
        # 第二次全量重抓不应产生重复行
        assert s.query(KlineDay).filter_by(code="sz000001").count() == 10
