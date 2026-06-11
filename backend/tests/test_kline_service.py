import pandas as pd
import pytest

from app.db import init_db, SessionLocal
from app.models import Stock, KlineDay
from app.kline_service import get_stock_kline


def _seed(code="sz000001", n=60):
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    with SessionLocal() as s:
        s.add(Stock(code=code, name="测试", is_st=False, is_bj=False))
        for i, d in enumerate(dates):
            c = 10.0 + i * 0.1
            s.add(KlineDay(code=code, date=d.strftime("%Y-%m-%d"),
                           open=c, close=c, high=c + 0.5, low=c - 0.5, volume=1000.0))
        s.commit()


def test_kline_service_returns_indicators(db_path):
    init_db()
    _seed()
    out = get_stock_kline("sz000001", "day")
    assert "data" in out and len(out["data"]) == 60
    first = out["data"][0]
    assert {"date", "open", "close", "high", "low", "k", "d", "j", "whiteLine", "yellowLine"} <= set(first)
    assert out["highLine"] == max(p["high"] for p in out["data"])
    assert out["highLabel"]


def test_kline_service_unknown_period_raises(db_path):
    init_db()
    _seed()
    with pytest.raises(ValueError):
        get_stock_kline("sz000001", "year")


def test_kline_service_empty_for_unknown_code(db_path):
    init_db()
    _seed()
    out = get_stock_kline("sz999999", "day")
    assert out["data"] == []
