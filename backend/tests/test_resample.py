import pandas as pd

from app.data.resample import resample_ohlcv


def _daily():
    # 2025-01 两周：1/6(周一)~1/10，1/13~1/17，每天 OHLCV 已知
    dates = pd.to_datetime([
        "2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09", "2025-01-10",
        "2025-01-13", "2025-01-14", "2025-01-15", "2025-01-16", "2025-01-17",
    ])
    return pd.DataFrame({
        "date": dates,
        "open": [10, 11, 12, 13, 14, 20, 21, 22, 23, 24],
        "high": [15, 16, 17, 18, 19, 25, 26, 27, 28, 29],
        "low": [5, 6, 7, 8, 9, 15, 16, 17, 18, 19],
        "close": [11, 12, 13, 14, 15, 21, 22, 23, 24, 25],
        "volume": [100, 100, 100, 100, 100, 200, 200, 200, 200, 200],
    })


def test_weekly_resample_aggregates_correctly():
    wk = resample_ohlcv(_daily(), "week").reset_index(drop=True)
    assert len(wk) == 2
    # 第一周：open=首(10) high=max(19) low=min(5) close=末(15) vol=求和(500)
    assert wk.iloc[0]["open"] == 10
    assert wk.iloc[0]["high"] == 19
    assert wk.iloc[0]["low"] == 5
    assert wk.iloc[0]["close"] == 15
    assert wk.iloc[0]["volume"] == 500
    # 第二周
    assert wk.iloc[1]["open"] == 20
    assert wk.iloc[1]["close"] == 25
    assert wk.iloc[1]["volume"] == 1000


def test_monthly_and_quarterly_keys():
    m = resample_ohlcv(_daily(), "month").reset_index(drop=True)
    assert len(m) == 1
    assert m.iloc[0]["open"] == 10 and m.iloc[0]["close"] == 25
    q = resample_ohlcv(_daily(), "quarter").reset_index(drop=True)
    assert len(q) == 1
    assert q.iloc[0]["volume"] == 1500


def test_empty_input_returns_empty():
    out = resample_ohlcv(pd.DataFrame(columns=["date", "open", "high", "low", "close", "volume"]), "week")
    assert out.empty
