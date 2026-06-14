from app.signals import oversold_scenario, is_bluechip, BLUECHIP_INDEX_CODES


def _closes(drawdown: float) -> list[float]:
    """peak=100，最后一根 = 100*(1-drawdown)。"""
    return [100.0, 100.0 * (1 - drawdown)]


def test_scenario_a():
    s = oversold_scenario(_closes(0.30), 5.0, 0.25, -15, 0.50, -30, 100)
    assert s == "A"


def test_scenario_b_priority_over_a():
    # 回撤 0.55 + ttm -25：A 不满足(-25 not > -15)，B 满足
    s = oversold_scenario(_closes(0.55), -25.0, 0.25, -15, 0.50, -30, 100)
    assert s == "B"


def test_scenario_b_requires_positive_annual_profit():
    s = oversold_scenario(_closes(0.55), -25.0, 0.25, -15, 0.50, -30, -1)
    assert s is None


def test_scenario_none_when_shallow():
    s = oversold_scenario(_closes(0.10), 5.0, 0.25, -15, 0.50, -30, 100)
    assert s is None


def test_scenario_none_when_ttm_missing():
    assert oversold_scenario(_closes(0.30), None, 0.25, -15, 0.50, -30, 100) is None


def test_bluechip_index_codes_constant():
    assert BLUECHIP_INDEX_CODES == {"000016", "000300", "000905"}


def test_is_bluechip_membership():
    codes = {"sh600519", "sz000001"}
    assert is_bluechip("sh600519", codes) is True
    assert is_bluechip("sz000002", codes) is False


def test_build_rows_bluechip_and_scenario(db_path):
    from app.db import init_db, SessionLocal
    init_db()
    from app.models import Stock, FinancialReport, KlineDay, IndexConstituent
    from app.fundamental_rows import build_fundamental_rows

    with SessionLocal() as s:
        # sh600519 在沪深300 → 蓝筹；sz000002 不在任何蓝筹指数
        s.add(IndexConstituent(index_code="000300", stock_code="sh600519", index_name="沪深300"))
        for code in ("sh600519", "sz000002"):
            s.add(Stock(code=code, name=code, market_cap=1000.0, industry="食品饮料",
                        is_st=False, is_bj=False, listed_at="2010-01-01"))
            s.add(FinancialReport(code=code, report_date="2023-12-31", net_profit=95.0,
                                  net_profit_yoy=3.0, revenue=500.0, revenue_yoy=2.0, gross_margin=50.0))
            s.add(FinancialReport(code=code, report_date="2024-12-31", net_profit=100.0,
                                  net_profit_yoy=5.0, revenue=520.0, revenue_yoy=4.0, gross_margin=50.0))
            # 回撤 30%：peak 100 → 70
            for i, close in enumerate([100.0, 90.0, 80.0, 70.0]):
                s.add(KlineDay(code=code, date=f"2024-0{i + 1}-01", open=close, close=close,
                               high=close, low=close, volume=1000.0))
        s.commit()

    rows = build_fundamental_rows({})
    by_code = {r["code"]: r for r in rows}
    assert by_code["sh600519"]["is_bluechip"] is True
    assert by_code["sh600519"]["oversold_scenario"] == "A"
    assert by_code["sh600519"]["oversold_bluechip"] is True
    assert by_code["sz000002"]["is_bluechip"] is False


from app.fundamental_screen import _display_signals, run_fundamental_screen_from_rows


def test_display_signals_scenario_a():
    assert "oversoldBluechipA" in _display_signals({"oversold_scenario": "A"})


def test_display_signals_scenario_b():
    assert "oversoldBluechipB" in _display_signals({"oversold_scenario": "B"})


def test_screen_emits_scenario_b_signal():
    rows = [{
        "code": "sh600519", "name": "贵州茅台", "industry": "食品饮料",
        "is_bluechip": True, "oversold_bluechip": True, "oversold_scenario": "B",
        "risk_price_new_low": False, "risk_industry_down": False,
        "risk_structural_decline": False,
        "drawdown_from_high": 0.55, "ttm_yoy": -25,
        "netProfitYoY": -25, "revenueYoY": -5,
    }]
    out = run_fundamental_screen_from_rows("oversold-bluechip", rows, {})
    assert len(out) == 1
    assert "oversoldBluechipB" in out[0]["signals"]
