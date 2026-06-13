import json

import pandas as pd

from app.data import fetch_kline


def test_normalize_code():
    # 沪市主板
    assert fetch_kline.normalize_stock_code_for_sina("600000") == "sh600000"
    assert fetch_kline.normalize_stock_code_for_sina("601398") == "sh601398"
    assert fetch_kline.normalize_stock_code_for_sina("603259") == "sh603259"
    assert fetch_kline.normalize_stock_code_for_sina("604000") == "sh604000"
    assert fetch_kline.normalize_stock_code_for_sina("605123") == "sh605123"
    # 科创板
    assert fetch_kline.normalize_stock_code_for_sina("688256") == "sh688256"
    assert fetch_kline.normalize_stock_code_for_sina("689009") == "sh689009"
    # 沪市B股
    assert fetch_kline.normalize_stock_code_for_sina("900901") == "sh900901"
    # 深市主板
    assert fetch_kline.normalize_stock_code_for_sina("000001") == "sz000001"
    assert fetch_kline.normalize_stock_code_for_sina("001696") == "sz001696"
    assert fetch_kline.normalize_stock_code_for_sina("002714") == "sz002714"
    assert fetch_kline.normalize_stock_code_for_sina("003011") == "sz003011"
    assert fetch_kline.normalize_stock_code_for_sina("004000") == "sz004000"
    # 创业板
    assert fetch_kline.normalize_stock_code_for_sina("300750") == "sz300750"
    assert fetch_kline.normalize_stock_code_for_sina("301234") == "sz301234"
    assert fetch_kline.normalize_stock_code_for_sina("302132") == "sz302132"
    # 深市B股
    assert fetch_kline.normalize_stock_code_for_sina("200045") == "sz200045"
    assert fetch_kline.normalize_stock_code_for_sina("201872") == "sz201872"
    # 北交所
    assert fetch_kline.normalize_stock_code_for_sina("430047") == "bj430047"
    assert fetch_kline.normalize_stock_code_for_sina("480001") == "bj480001"
    assert fetch_kline.normalize_stock_code_for_sina("830799") == "bj830799"
    assert fetch_kline.normalize_stock_code_for_sina("870976") == "bj870976"
    assert fetch_kline.normalize_stock_code_for_sina("920001") == "bj920001"
    # 老三板（归 bj 以便统一过滤）
    assert fetch_kline.normalize_stock_code_for_sina("400079") == "bj400079"
    assert fetch_kline.normalize_stock_code_for_sina("420079") == "bj420079"
    # 已有前缀直接返回
    assert fetch_kline.normalize_stock_code_for_sina("sz000001") == "sz000001"
    assert fetch_kline.normalize_stock_code_for_sina("sh600000") == "sh600000"
    assert fetch_kline.normalize_stock_code_for_sina("bj830001") == "bj830001"
    # 不足6位自动补零
    assert fetch_kline.normalize_stock_code_for_sina("1") == "sz000001"


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
    # 总市值单位为万元（新浪接口口径）：50亿=500000万，500亿=5000000万，10000亿=1e8万
    spot = pd.DataFrame({"代码": ["000001", "600000", "300750"],
                         "名称": ["平安银行", "浦发银行", "宁德时代"],
                         "总市值": [5e5, 5e6, 1e8]})
    monkeypatch.setattr(fetch_kline, "fetch_sina_spot", lambda **kwargs: spot)
    rows = fetch_kline.get_constituents(min_cap=1e10)
    codes = [r["code"] for r in rows]
    assert "sz000001" not in codes  # 50亿 < 100亿门槛
    assert "sh600000" in codes
    assert "sz300750" in codes
    assert dict(zip(codes, [r["name"] for r in rows]))["sz300750"] == "宁德时代"
