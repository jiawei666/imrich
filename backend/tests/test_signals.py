from app.signals import (
    beat_expect,
    compute_single_quarter_series,
    high_growth,
    industry_new_high,
    low_position_oversold,
    price_new_high,
    risk_industry_down,
    risk_price_new_low,
    risk_profit_decline,
)


def test_compute_single_quarter_series_derives_q2_q3_q4_by_diff():
    dates = ["2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31"]
    cumulative = [10.0, 25.0, 45.0, 70.0, 15.0]
    out = compute_single_quarter_series(dates, cumulative)
    assert out == [10.0, 15.0, 20.0, 25.0, 15.0]


def test_compute_single_quarter_series_propagates_none():
    dates = ["2024-03-31", "2024-06-30"]
    cumulative = [10.0, None]
    assert compute_single_quarter_series(dates, cumulative) == [10.0, None]


def test_high_growth_threshold():
    assert high_growth(60.0) is True
    assert high_growth(50.0) is False
    assert high_growth(40.0) is False
    assert high_growth(None) is False
    assert high_growth(120.0, threshold=100.0) is True


def test_beat_expect_by_history_uses_median():
    assert beat_expect(35.0, history_yoys=[20.0, 30.0, 40.0]) is True
    assert beat_expect(25.0, history_yoys=[20.0, 30.0, 40.0]) is False
    assert beat_expect(35.0, history_yoys=[]) is False
    assert beat_expect(None, history_yoys=[20.0, 30.0]) is False


def test_beat_expect_by_forecast_threshold():
    assert beat_expect(None, forecast_change_pct=80.0) is True
    assert beat_expect(None, forecast_change_pct=40.0) is False
    assert beat_expect(None, forecast_change_pct=None) is False
    assert beat_expect(None, forecast_change_pct=60.0, threshold=50.0) is True


def test_price_new_high_within_tolerance():
    assert price_new_high([80.0, 100.0, 97.0]) is True
    assert price_new_high([80.0, 100.0, 90.0]) is False
    assert price_new_high([80.0, 90.0, 100.0]) is True
    assert price_new_high([]) is False


def test_industry_new_high_strict():
    assert industry_new_high([100.0, 105.0, 110.0]) is True
    assert industry_new_high([100.0, 110.0, 105.0]) is False


def test_low_position_oversold():
    closes = [100.0] + [60.0] * 10
    assert low_position_oversold(closes, 10.0) is True
    closes2 = [100.0] + [70.0] * 10
    assert low_position_oversold(closes2, 10.0) is False
    assert low_position_oversold(closes, -5.0) is False
    assert low_position_oversold(closes, None) is False


def test_risk_price_new_low():
    assert risk_price_new_low([10.0, 9.0, 8.0]) is True
    assert risk_price_new_low([10.0, 8.0, 9.0]) is False
    assert risk_price_new_low([]) is False


def test_risk_profit_decline():
    rows = [
        {"report_date": "2024-06-30", "net_profit_yoy": 20.0},
        {"report_date": "2024-09-30", "net_profit_yoy": 10.0},
        {"report_date": "2024-12-31", "net_profit_yoy": -5.0},
    ]
    assert risk_profit_decline(rows) is True
    assert risk_profit_decline(rows[:2]) is False
    assert risk_profit_decline([{"report_date": "2024-12-31", "net_profit_yoy": None}]) is False


def test_risk_industry_down():
    assert risk_industry_down([10.0, 5.0, -2.0]) is True
    assert risk_industry_down([10.0, 12.0, 8.0]) is False
    assert risk_industry_down([]) is False
