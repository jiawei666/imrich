from app.db import SessionLocal, init_db
from app.models import FinancialReport, KlineDay, ResearchReport, Stock
from app.screen import run_fundamental_screen_result


def test_run_fundamental_screen_result_saves_and_reads(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", industry="银行"))
        s.add(FinancialReport(
            code="sz000001", report_date="2025-03-31",
            net_profit=1e9, net_profit_yoy=70, revenue=5e9, revenue_yoy=35, gross_margin=30,
        ))
        # 多条 K 线确保最新价不是最低价（避免 risk_price_new_low）
        s.add(KlineDay(code="sz000001", date="2025-06-08", open=8, close=9, high=10, low=8, volume=100))
        s.add(KlineDay(code="sz000001", date="2025-06-09", open=9, close=10, high=11, low=9, volume=100))
        s.add(KlineDay(code="sz000001", date="2025-06-10", open=10, close=12, high=13, low=10, volume=100))
        # 研报需包含关键词以触发 research_signals
        s.add(ResearchReport(
            report_id="rpt001", code="sz000001", title="订单饱满推动业绩高增",
            published_at="2025-06-01", stage="parsed",
        ))
        s.commit()

    result = run_fundamental_screen_result("super-growth", {"netProfitYoY": 60, "revenueYoY": 30})
    assert result["total"] > 0
    assert result["updatedAt"] is not None
    assert result["items"][0]["code"] == "sz000001"
    assert "risks" in result["items"][0]
    assert "drawdownFromHigh" in result["items"][0]

    # 不带 params 应返回上次结果
    cached = run_fundamental_screen_result("super-growth")
    assert cached["total"] == result["total"]
    assert cached["items"][0]["code"] == result["items"][0]["code"]


def test_run_fundamental_screen_result_empty_without_prior(db_path):
    init_db()
    result = run_fundamental_screen_result("super-growth")
    assert result["total"] == 0
    assert result["items"] == []
    assert result["updatedAt"] is None
