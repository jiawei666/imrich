import json

import pandas as pd

from app.data import fetch_kline


def test_normalize_code():
    assert fetch_kline.normalize_stock_code_for_sina("600000") == "sh600000"
    assert fetch_kline.normalize_stock_code_for_sina("000001") == "sz000001"
    assert fetch_kline.normalize_stock_code_for_sina("300750") == "sz300750"
    assert fetch_kline.normalize_stock_code_for_sina("688256") == "sh688256"
    assert fetch_kline.normalize_stock_code_for_sina("sz000001") == "sz000001"


def test_get_kline_ak_tx_parses_tencent_json(monkeypatch):
    fake = {"data": {"sz000001": {"day": [
        ["2025-01-02", "10.0", "10.5", "10.6", "9.9", "120.0"],
        ["2025-01-03", "10.5", "10.2", "10.7", "10.1", "100.0"],
    ]}}}

    class _Resp:
        text = json.dumps(fake)

    monkeypatch.setattr(fetch_kline.requests, "get", lambda *a, **k: _Resp())
    df = fetch_kline.get_kline_ak_tx("000001", "", "")
    assert list(df.columns) == ["date", "open", "close", "high", "low", "volume"]
    assert len(df) == 2
    # amount(手) * 100 = volume(股)
    assert df.iloc[0]["volume"] == 12000.0
    assert df.iloc[0]["close"] == 10.5


def test_get_constituents_filters_by_mktcap(monkeypatch):
    spot = pd.DataFrame({"代码": ["000001", "600000", "300750"],
                         "名称": ["平安银行", "浦发银行", "宁德时代"],
                         "总市值": [5e9, 5e10, 1e12]})
    monkeypatch.setattr(fetch_kline.ak, "stock_zh_a_spot_em", lambda: spot)
    rows = fetch_kline.get_constituents(min_cap=1e10)
    codes = [r["code"] for r in rows]
    assert "sz000001" not in codes  # 50亿 < 100亿门槛
    assert "sh600000" in codes
    assert "sz300750" in codes
    assert dict(zip(codes, [r["name"] for r in rows]))["sz300750"] == "宁德时代"
