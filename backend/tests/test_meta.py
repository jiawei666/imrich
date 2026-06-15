from app.db import SessionLocal, init_db
from app.meta import get_meta
from app.models import FinancialReport, Forecast, IndustryIndex, KlineDay, ResearchReport, Stock


def test_get_meta_reports_latest_timestamps(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(Stock(code="sz000001", name="平安银行", updated_at="2026-06-10 10:00:00"))
        s.add(KlineDay(code="sz000001", date="2026-06-10", open=1, close=1, high=1, low=1, volume=1))
        s.add(FinancialReport(code="sz000001", report_date="2026-03-31", net_profit=1, net_profit_yoy=1, updated_at="2026-04-30 10:00:00"))
        s.add(Forecast(code="sz000001", report_date="2026-03-31", source="forecast", updated_at="2026-04-20 10:00:00"))
        s.add(IndustryIndex(code="850111", name="银行", date="2026-06-10", open=1, close=1, high=1, low=1, volume=1))
        s.add(ResearchReport(report_id="R1", code="sz000001", title="订单饱满", published_at="2026-06-01", stage="parsed", updated_at="2026-06-02 10:00:00"))
        s.commit()
    meta = get_meta()
    assert meta["stockList"]["updatedAt"] == "2026-06-10 10:00:00"
    assert meta["klineDay"]["updatedAt"] == "2026-06-10"
    assert meta["financialReports"]["reportPeriod"] == "2026Q1"
    assert meta["researchReports"]["stage2CandidateCount"] == 1
    assert meta["researchReports"]["stage2UpdatedAt"] == "2026-06-02 10:00:00"
