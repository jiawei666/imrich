import numpy as np
import pandas as pd

from app.selectors import TrendSupportSelector, B2Selector, SELECTOR_REGISTRY


def _hist(closes, volumes=None):
    n = len(closes)
    volumes = volumes or [1000.0] * n
    dates = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame({
        "date": dates,
        "open": closes,
        "close": closes,
        "high": [c + 0.3 for c in closes],
        "low": [c - 0.3 for c in closes],
        "volume": volumes,
    })


def test_registry_has_both_strategies():
    assert set(SELECTOR_REGISTRY) == {"trend-support", "b2"}


def test_trend_support_rejects_big_jump():
    # 最后一天 +10%，超出 pct_chg_max=1.8 → 必被拒
    closes = [10.0] * 120 + [11.0]
    sel = TrendSupportSelector()
    assert sel._passes_filters(_hist(closes)) is False


def test_trend_support_rejects_flat_series():
    # 全常数 → 白线 == 黄线，条件「白线>黄线」不满足 → 拒
    sel = TrendSupportSelector()
    assert sel._passes_filters(_hist([10.0] * 130)) is False


def test_b2_rejects_without_volume_expansion():
    # 最后一天涨 5% 但量没放大 → 拒
    closes = [10.0] * 10 + [10.5]
    vols = [1000.0] * 11
    sel = B2Selector()
    assert sel._passes_filters(_hist(closes, vols)) is False


def test_b2_rejects_when_not_up_enough():
    # 最后一天只涨 1%（< up_threshold=4）→ 拒
    closes = [10.0] * 10 + [10.1]
    vols = [1000.0] * 10 + [5000.0]
    sel = B2Selector()
    assert sel._passes_filters(_hist(closes, vols)) is False


def test_evaluate_returns_none_when_rejected():
    sel = TrendSupportSelector()
    assert sel.evaluate(_hist([10.0] * 130)) is None


def test_select_returns_list():
    sel = B2Selector()
    data = {"sz000001": _hist([10.0] * 50)}
    picks = sel.select(pd.Timestamp("2024-02-19"), data)
    assert isinstance(picks, list)
