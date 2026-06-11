from app.fundamental_screen import run_fundamental_screen_from_rows, score_candidate


def test_score_candidate_adds_weighted_signals_and_caps_at_100():
    row = {
        "signals": ["highGrowth", "newHigh", "beatExpect", "sectorEffect", "industryNewHigh", "alpha", "orderFull"],
        "netProfitYoY": 80,
        "revenueYoY": 40,
    }
    assert score_candidate(row) == 100.0


def test_super_growth_requires_growth_new_high_and_research_keyword():
    rows = [
        {
            "code": "sz000001",
            "name": "平安银行",
            "industry": "银行",
            "high_growth": True,
            "beat_expect": True,
            "profit_record": True,
            "price_new_high": True,
            "industry_new_high": True,
            "research_signals": ["orderFull"],
            "sector_effect": True,
            "alpha": True,
            "oversold": False,
            "risk_profit_decline": False,
            "risk_price_new_low": False,
            "risk_industry_down": False,
            "netProfitYoY": 70,
            "revenueYoY": 30,
        }
    ]
    out = run_fundamental_screen_from_rows("super-growth", rows, {})
    assert out[0]["code"] == "sz000001"
    assert "highGrowth" in out[0]["signals"]
    assert "orderFull" in out[0]["signals"]


def test_oversold_bluechip_rejects_industry_down_risk():
    rows = [
        {
            "code": "sz000001",
            "name": "平安银行",
            "industry": "银行",
            "high_growth": False,
            "beat_expect": False,
            "profit_record": False,
            "price_new_high": False,
            "industry_new_high": False,
            "research_signals": ["valuationRepair"],
            "sector_effect": False,
            "alpha": False,
            "oversold": True,
            "risk_profit_decline": False,
            "risk_price_new_low": False,
            "risk_industry_down": True,
            "netProfitYoY": 10,
            "revenueYoY": 5,
        }
    ]
    assert run_fundamental_screen_from_rows("oversold-bluechip", rows, {}) == []
