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
    monkeypatch.setattr(refresh, "run_kline_refresh",
                        lambda *a, **k: called.setdefault("ran", True))
    r = client.post("/refresh/kline")
    assert r.status_code in (200, 202)
    assert called.get("ran") is True


def test_refresh_fundamental_triggers_background(client, monkeypatch):
    refresh.reset_state()
    called = {}
    monkeypatch.setattr(refresh, "run_fundamental_refresh", lambda *a, **k: called.setdefault("ran", True))
    r = client.post("/refresh/fundamental")
    assert r.status_code in (200, 202)
    assert called.get("ran") is True


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


def test_stock_detail_returns_404_for_missing_stock(client):
    r = client.get("/stock/sz999999")
    assert r.status_code == 404


def test_fundamental_screen_returns_empty_when_no_reports(client):
    r = client.get("/screen", params={"preset": "super-growth", "params": json.dumps({})})
    assert r.status_code == 200
    assert r.json() == []
