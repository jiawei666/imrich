import pandas as pd

from app.db import init_db, SessionLocal
from app.models import Stock, KlineDay
from app.selectors import B2Selector
from app.screen import run_technical_screen


def _seed(code, closes, vols):
    dates = pd.date_range("2025-01-01", periods=len(closes), freq="D")
    with SessionLocal() as s:
        s.add(Stock(code=code, name=code.upper(), industry="测试业", is_st=False, is_bj=False))
        for d, c, v in zip(dates, closes, vols):
            s.add(KlineDay(code=code, date=d.strftime("%Y-%m-%d"),
                           open=c, close=c, high=c + 0.3, low=c - 0.3, volume=v))
        s.commit()


def test_screen_returns_candidate_when_selector_passes(db_path):
    init_db()
    # 构造一只必然通过 B2 的股票：先连续下跌压低 J，最后一日放量大涨
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed("sz000001", closes, vols)
    # 用同一 selector 现算 picks 作为期望（验证 DB↔screen 串联，而非重算指标）
    df = pd.DataFrame({
        "date": pd.date_range("2025-01-01", periods=len(closes), freq="D"),
        "open": closes, "close": closes,
        "high": [c + 0.3 for c in closes], "low": [c - 0.3 for c in closes],
        "volume": vols,
    })
    sel = B2Selector()
    expected = sel.select(df["date"].max(), {"sz000001": df})

    cands = run_technical_screen("b2", {})
    codes = [c["code"] for c in cands]
    assert codes == expected
    if cands:
        c = cands[0]
        assert c["name"] == "SZ000001"
        assert c["industry"] == "测试业"
        assert c["strategyName"] == "B2战法"
        assert "pctChg" in c["diagnostics"] and "volRatio" in c["diagnostics"]
        assert c["triggerDate"] == "2025-02-09"


def test_screen_excludes_delisted(db_path):
    init_db()
    _seed("sz000001", [10.0] * 50, [1000.0] * 50)
    with SessionLocal() as s:
        s.get(Stock, "sz000001").delisted_at = "2025-01-01 00:00:00"
        s.commit()
    cands = run_technical_screen("b2", {})
    assert cands == []


def test_screen_skips_stock_without_enough_kline_history(db_path):
    init_db()
    _seed("sz000001", [10.0], [1000.0])
    cands = run_technical_screen("trend-support", {})
    assert cands == []


import json
from app.models import ScreenSnapshot


def _seed_with_date(code, closes, vols, start="2025-01-01"):
    dates = pd.date_range(start, periods=len(closes), freq="D")
    with SessionLocal() as s:
        s.add(Stock(code=code, name=code.upper(), industry="测试业", is_st=False, is_bj=False))
        for d, c, v in zip(dates, closes, vols):
            s.add(KlineDay(code=code, date=d.strftime("%Y-%m-%d"),
                           open=c, close=c, high=c + 0.3, low=c - 0.3, volume=v))
        s.commit()


def test_screen_saves_snapshot(db_path):
    init_db()
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed_with_date("sz000001", closes, vols)

    result = run_technical_screen("b2", {})

    with SessionLocal() as s:
        snap = s.query(ScreenSnapshot).filter_by(preset_id="b2").one()
        assert snap.candidate_count == len(result)
        assert json.loads(snap.candidates_json) == result
        assert json.loads(snap.params_json) == {}
        assert snap.updated_at is not None


def test_screen_returns_cached_result_on_same_params(db_path):
    init_db()
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed_with_date("sz000001", closes, vols)

    first = run_technical_screen("b2", {})
    second = run_technical_screen("b2", {})

    assert first == second
    with SessionLocal() as s:
        assert s.query(ScreenSnapshot).filter_by(preset_id="b2").count() == 1


def test_screen_overwrites_snapshot_on_different_params(db_path):
    init_db()
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed_with_date("sz000001", closes, vols)

    run_technical_screen("b2", {})
    run_technical_screen("b2", {"up_threshold": 3.0})

    with SessionLocal() as s:
        assert s.query(ScreenSnapshot).filter_by(preset_id="b2").count() == 1
        snap = s.query(ScreenSnapshot).filter_by(preset_id="b2").one()
        assert json.loads(snap.params_json) == {"up_threshold": 3.0}


def test_screen_saves_empty_candidates_snapshot(db_path):
    init_db()
    _seed_with_date("sz000001", [10.0] * 50, [1000.0] * 50)

    result = run_technical_screen("b2", {})
    assert result == []

    with SessionLocal() as s:
        snap = s.query(ScreenSnapshot).filter_by(preset_id="b2").one()
        assert snap.candidate_count == 0
        assert json.loads(snap.candidates_json) == []

    # 缓存命中
    second = run_technical_screen("b2", {})
    assert second == []


def test_list_and_get_screen_snapshots(db_path):
    init_db()
    closes = [20 - i * 0.4 for i in range(40)] + [(20 - 39 * 0.4) * 1.06]
    vols = [1000.0] * 40 + [5000.0]
    _seed_with_date("sz000001", closes, vols)

    from app.screen import list_screen_snapshots, get_screen_snapshot
    run_technical_screen("b2", {})

    history = list_screen_snapshots("b2")
    assert len(history) == 1
    assert "date" in history[0]
    assert history[0]["count"] >= 0

    date = history[0]["date"]
    detail = get_screen_snapshot("b2", date)
    assert detail is not None
    assert isinstance(detail, list)

    assert get_screen_snapshot("b2", "2099-01-01") is None
