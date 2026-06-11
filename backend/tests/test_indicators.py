import numpy as np
import pandas as pd

from app.indicators import (
    compute_kdj, compute_bbi, compute_dif,
    compute_zhixing_short_trend, compute_zhixing_bull_bear,
)


def _df(closes):
    n = len(closes)
    return pd.DataFrame({
        "close": closes,
        "high": [c + 0.5 for c in closes],
        "low": [c - 0.5 for c in closes],
        "open": closes,
        "volume": [1000.0] * n,
    })


def test_kdj_first_row_is_50():
    out = compute_kdj(_df([10.0, 10.0, 10.0]))
    assert out.iloc[0]["K"] == 50.0
    assert out.iloc[0]["D"] == 50.0
    assert out.iloc[0]["J"] == 50.0


def test_dif_constant_series_is_zero():
    dif = compute_dif(_df([10.0] * 30))
    assert abs(float(dif.iloc[-1])) < 1e-6


def test_bull_bear_constant_series_equals_price():
    s = compute_zhixing_bull_bear(_df([10.0] * 120))
    assert abs(float(s.iloc[-1]) - 10.0) < 1e-9


def test_short_trend_constant_series_equals_price():
    s = compute_zhixing_short_trend(_df([10.0] * 30), span=10)
    assert abs(float(s.iloc[-1]) - 10.0) < 1e-9


def test_bbi_needs_24_points():
    s = compute_bbi(_df([float(i) for i in range(30)]))
    assert not np.isnan(float(s.iloc[-1]))
