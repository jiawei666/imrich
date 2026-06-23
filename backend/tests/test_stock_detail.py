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
    # industries 表为空时，industry/subIndustry 均 fallback 为 stock.industry
    assert detail["industry"] == "银行"
    assert detail["subIndustry"] == "银行"
    # 确保占位字段已移除
    assert "score" not in detail
    assert "signals" not in detail
    assert "risks" not in detail


def test_get_stock_detail_industry_uses_parent_name(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000002", name="测试股份", industry="锂电池", parent_industry="电力设备"))
        s.commit()
    detail = get_stock_detail("sz000002")
    assert detail["industry"] == "电力设备"
    assert detail["subIndustry"] == "锂电池"


def test_get_stock_detail_returns_industry_reports_for_sub_industry(db_path):
    init_db()
    from app.models import IndustryResearchReport

    with SessionLocal() as s:
        s.add(Stock(code="sz000003", name="测试股份", industry="锂电池", parent_industry="电力设备"))
        s.add(IndustryResearchReport(
            report_id="IR1",
            industry="锂电池",
            title="锂电池行业深度",
            org="测试证券",
            published_at="2026-06-02",
            pdf_url="https://example.com/ir1.pdf",
        ))
        s.add(IndustryResearchReport(
            report_id="IR2",
            industry="电力设备",
            title="电力设备行业策略",
            org="测试证券",
            published_at="2026-06-01",
            pdf_url="https://example.com/ir2.pdf",
        ))
        s.commit()

    detail = get_stock_detail("sz000003")

    assert detail["industryReports"] == [
        {
            "title": "锂电池行业深度",
            "org": "测试证券",
            "date": "2026-06-02",
            "pdfUrl": "https://example.com/ir1.pdf",
            "industry": "锂电池",
        }
    ]


def test_get_stock_detail_uses_industry_report_alias_when_sub_industry_differs(db_path):
    init_db()
    from app.models import IndustryResearchReport

    with SessionLocal() as s:
        s.add(Stock(code="sz000004", name="测试股份", industry="锂电池", parent_industry="电力设备"))
        s.add(IndustryResearchReport(
            report_id="IR-alias",
            industry="电池",
            title="电池行业深度",
            org="测试证券",
            published_at="2026-06-03",
            pdf_url="https://example.com/battery.pdf",
        ))
        s.commit()

    detail = get_stock_detail("sz000004")

    assert detail["industryReports"][0]["title"] == "电池行业深度"
    assert detail["industryReports"][0]["industry"] == "电池"
