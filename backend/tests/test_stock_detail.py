from app.db import SessionLocal, init_db
from app.models import FinancialReport, KlineDay, KlineMonth, KlineQuarter, KlineWeek, ResearchReport, Stock
from app.stock_detail import get_stock_detail


def test_get_stock_detail_returns_financial_kline_reports_and_risks(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", industry="银行"))
        s.add(KlineDay(code="sz000001", date="2026-06-10", open=10, close=12, high=13, low=9, volume=100))
        s.add(KlineWeek(code="sz000001", date="2026-06-06", open=10, close=12, high=13, low=9, volume=100))
        s.add(KlineMonth(code="sz000001", date="2026-06-01", open=10, close=12, high=13, low=9, volume=100))
        s.add(KlineQuarter(code="sz000001", date="2026-06-01", open=10, close=12, high=13, low=9, volume=100))
        s.add(
            FinancialReport(
                code="sz000001",
                report_date="2026-03-31",
                net_profit=100000000,
                net_profit_yoy=60,
                revenue=500000000,
                revenue_yoy=20,
                gross_margin=30,
            )
        )
        s.add(ResearchReport(report_id="R1", code="sz000001", title="订单饱满", org="测试证券", published_at="2026-06-01", stage="metadata"))
        s.commit()
    detail = get_stock_detail("sz000001")
    assert detail["code"] == "sz000001"
    assert detail["quarters"][0]["quarter"] == "2026Q1"
    assert detail["reports"][0]["title"] == "订单饱满"
    assert detail["klineDay"][0]["date"] == "2026-06-10"
