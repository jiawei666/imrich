import pytest
from app.db import SessionLocal, init_db
from app.models import FinancialReport, KlineDay, KlineMonth, KlineQuarter, KlineWeek, ResearchReport, Stock
from app.stock_detail import get_stock_detail


def test_get_stock_detail_returns_quarterly_data(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", industry="银行"))
        s.add(KlineDay(code="sz000001", date="2026-06-10", open=10, close=12, high=13, low=9, volume=100))
        s.add(KlineWeek(code="sz000001", date="2026-06-06", open=10, close=12, high=13, low=9, volume=100))
        s.add(KlineMonth(code="sz000001", date="2026-06-01", open=10, close=12, high=13, low=9, volume=100))
        s.add(KlineQuarter(code="sz000001", date="2026-06-01", open=10, close=12, high=13, low=9, volume=100))
        s.add(FinancialReport(
            code="sz000001", report_date="2025-03-31",
            net_profit=100000000, net_profit_yoy=60,
            revenue=500000000, revenue_yoy=20, gross_margin=30,
        ))
        s.add(FinancialReport(
            code="sz000001", report_date="2025-06-30",
            net_profit=250000000, net_profit_yoy=55,
            revenue=1200000000, revenue_yoy=18, gross_margin=28,
        ))
        s.add(ResearchReport(report_id="R1", code="sz000001", title="订单饱满", org="测试证券",
                             published_at="2026-06-01", stage="parsed"))
        s.commit()
    detail = get_stock_detail("sz000001")
    assert detail["code"] == "sz000001"
    assert detail["quarters"][0]["quarter"] == "2025Q1"
    assert detail["quarters"][0]["netProfitQuarterly"] == pytest.approx(1.0)
    # Q2 单季度 = 250M - 100M = 150M → 1.5 亿
    assert detail["quarters"][1]["netProfitQuarterly"] == pytest.approx(1.5)
    assert detail["reports"][0]["title"] == "订单饱满"
    # 确保占位字段已移除
    assert "score" not in detail
    assert "signals" not in detail
    assert "risks" not in detail
