import json

import pandas as pd

from app.db import SessionLocal
from app.models import Stock, KlineDay
from app import refresh


def _seed_one(code="sz000001", n=50):
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    with SessionLocal() as s:
        s.add(Stock(code=code, name="测试股", industry="测试业", is_st=False, is_bj=False))
        for i, d in enumerate(dates):
            c = 10.0 + i * 0.1
            s.add(KlineDay(code=code, date=d.strftime("%Y-%m-%d"),
                           open=c, close=c, high=c + 0.5, low=c - 0.5, volume=1000.0))
        s.commit()


def test_presets_endpoint(client):
    r = client.get("/presets")
    assert r.status_code == 200
    assert {p["id"] for p in r.json()} == {"super-growth", "oversold-bluechip", "trend-support", "b2"}


def test_refresh_status_initial(client):
    refresh.reset_state()
    r = client.get("/refresh/status")
    body = r.json()
    assert body["kline"]["status"] == "idle"
    assert "fundamental" in body
    assert isinstance(body["kline"]["steps"], list)


def test_screen_endpoint(client):
    _seed_one()
    r = client.get("/screen", params={"preset": "b2", "params": json.dumps({})})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_screen_unknown_preset_returns_400(client):
    r = client.get("/screen", params={"preset": "nope"})
    assert r.status_code == 400


def test_stock_kline_endpoint(client):
    _seed_one()
    r = client.get("/stock/sz000001/kline", params={"period": "day"})
    assert r.status_code == 200
    body = r.json()
    assert len(body["data"]) == 50
    assert "highLine" in body


def test_refresh_kline_triggers_background(client, monkeypatch):
    refresh.reset_state()
    called = {}
    monkeypatch.setattr(refresh, "run_kline_data_refresh",
                        lambda *a, **k: called.setdefault("ran", True))
    r = client.post("/refresh/kline")
    assert r.status_code in (200, 202)
    assert called.get("ran") is True


def test_refresh_stock_list_triggers_background(client, monkeypatch):
    refresh.reset_state()
    called = {}
    monkeypatch.setattr(refresh, "run_stock_list_refresh",
                        lambda *a, **k: called.setdefault("ran", True))
    r = client.post("/refresh/stock-list")
    assert r.status_code in (200, 202)
    assert called.get("ran") is True


def test_refresh_all_triggers_background(client, monkeypatch):
    refresh.reset_state()
    called = {}
    monkeypatch.setattr(refresh, "run_full_refresh",
                        lambda *a, **k: called.setdefault("ran", True))
    r = client.post("/refresh/all")
    assert r.status_code in (200, 202)
    assert called.get("ran") is True


def test_refresh_rejected_when_all_running(client, monkeypatch):
    refresh.reset_state()
    refresh.STATE["all"].status = "running"
    r = client.post("/refresh/kline")
    assert r.status_code == 409
    r = client.post("/refresh/stock-list")
    assert r.status_code == 409
    r = client.post("/refresh/all")
    assert r.status_code == 409
    r = client.post("/refresh/fundamental/financial")
    assert r.status_code == 409


def test_screen_dispatches_fundamental_strategy(client, monkeypatch):
    from app import main as main_module

    monkeypatch.setattr(main_module, "run_screen", lambda preset, params: [{"code": "sz000001"}])
    r = client.get("/screen", params={"preset": "super-growth", "params": json.dumps({"keywordWindow": 90})})
    assert r.status_code == 200
    assert r.json() == [{"code": "sz000001"}]


def test_meta_endpoint(client):
    r = client.get("/meta")
    assert r.status_code == 200
    assert "stockList" in r.json()


def test_indices_endpoint_returns_distinct_indices(client):
    from app.models import IndexConstituent

    with SessionLocal() as s:
        s.add(IndexConstituent(index_code="000300", stock_code="sz000001", index_name="沪深300"))
        s.add(IndexConstituent(index_code="000300", stock_code="sh600519", index_name="沪深300"))
        s.add(IndexConstituent(index_code="000905", stock_code="sz000002", index_name="中证500"))
        s.commit()

    r = client.get("/indices")
    assert r.status_code == 200
    by_code = {i["indexCode"]: i for i in r.json()}
    assert by_code["000300"]["indexName"] == "沪深300"
    assert set(by_code["000300"]["stockCodes"]) == {"sz000001", "sh600519"}
    assert by_code["000905"]["indexName"] == "中证500"
    assert by_code["000905"]["stockCodes"] == ["sz000002"]


def test_stock_detail_returns_404_for_missing_stock(client):
    r = client.get("/stock/sz999999")
    assert r.status_code == 404


def test_fundamental_screen_returns_empty_when_no_reports(client):
    r = client.get("/screen", params={"preset": "super-growth", "params": json.dumps({})})
    assert r.status_code == 200
    assert r.json() == []


def test_screen_history_endpoint_empty(client):
    r = client.get("/screen/history", params={"preset": "b2"})
    assert r.status_code == 200
    assert r.json() == []


def test_screen_history_endpoint_returns_snapshots(client):
    _seed_one()
    # 先触发一次筛选以产生快照
    client.get("/screen", params={"preset": "b2", "params": json.dumps({})})

    r = client.get("/screen/history", params={"preset": "b2"})
    assert r.status_code == 200
    body = r.json()
    assert len(body) >= 1
    assert "date" in body[0]
    assert "count" in body[0]
    assert "updatedAt" in body[0]


def test_screen_history_detail_endpoint(client):
    _seed_one()
    client.get("/screen", params={"preset": "b2", "params": json.dumps({})})

    # 获取历史列表
    history = client.get("/screen/history", params={"preset": "b2"}).json()
    assert len(history) >= 1
    date = history[0]["date"]

    r = client.get(f"/screen/history/{date}", params={"preset": "b2"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_screen_history_detail_404(client):
    r = client.get("/screen/history/2099-01-01", params={"preset": "b2"})
    assert r.status_code == 404
