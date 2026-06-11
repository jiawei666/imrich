from pathlib import Path

import pandas as pd

from app import refresh
from app.db import SessionLocal, init_db
from app.models import FinancialReport, Forecast, IndustryIndex, ResearchReport, Stock


def test_run_fundamental_refresh_marks_done(db_path):
    init_db()
    refresh.reset_state()

    refresh.run_fundamental_refresh(
        financial_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "net_profit": 1.0e9,
                "net_profit_yoy": 60.0,
                "revenue": 5.0e9,
                "revenue_yoy": 30.0,
                "gross_margin": 25.0,
            }
        ],
        forecast_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "source": "forecast",
                "indicator": "净利润",
                "change_desc": "预增",
                "change_pct": 80.0,
                "forecast_value": 1.2e9,
                "prior_value": 6.6e8,
                "notice_date": "2025-04-10",
            }
        ],
        express_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "source": "express",
                "net_profit": 1.1e9,
                "net_profit_yoy": 65.0,
                "revenue": 5.2e9,
                "revenue_yoy": 32.0,
                "notice_date": "2025-04-12",
            }
        ],
        industries_fn=lambda: [{"code": "850111", "name": "银行"}],
        industry_hist_fn=lambda code: pd.DataFrame(
            [{"date": "2025-01-02", "open": 100.0, "close": 101.0, "high": 102.0, "low": 99.0, "volume": 1000.0}]
        ),
        constituents_fn=lambda code: ["sz000001"],
    )

    group = refresh.STATE["fundamental"]
    assert group.status == "done"
    assert group.updatedAt is not None
    assert all(step.progress == 100 for step in group.steps[:3])

    with SessionLocal() as s:
        assert s.query(FinancialReport).count() == 1
        assert s.query(Forecast).count() == 2
        assert s.query(IndustryIndex).count() == 1
        stock = s.get(Stock, "sz000001")
        assert stock is not None
        assert stock.industry == "银行"


def test_run_fundamental_refresh_marks_error_on_exception(db_path):
    init_db()
    refresh.reset_state()

    def boom(rd):
        raise RuntimeError("boom")

    import pytest

    with pytest.raises(RuntimeError):
        refresh.run_fundamental_refresh(
            financial_fn=boom,
            forecast_fn=lambda rd: [],
            express_fn=lambda rd: [],
            industries_fn=lambda: [],
            industry_hist_fn=lambda code: pd.DataFrame(),
            constituents_fn=lambda code: [],
        )
    assert refresh.STATE["fundamental"].status == "error"


def test_refresh_research_metadata_upserts_stage1(db_path):
    init_db()
    refresh.refresh_research_metadata(
        lambda: [
            {
                "report_id": "R1",
                "code": "sz000001",
                "name": "平安银行",
                "title": "订单饱满",
                "org": "测试证券",
                "published_at": "2025-06-01",
                "summary": "",
                "pdf_url": "https://example.test/r1.pdf",
            }
        ]
    )
    with SessionLocal() as s:
        row = s.query(ResearchReport).filter_by(report_id="R1").one()
        assert row.stage == "metadata"


def test_refresh_research_pdfs_only_parses_candidate_pool(db_path, tmp_path):
    init_db()
    with SessionLocal() as s:
        s.add(ResearchReport(report_id="R1", code="sz000001", title="a", published_at="2025-06-01", pdf_url="u1", stage="metadata"))
        s.add(ResearchReport(report_id="R2", code="sz000002", title="b", published_at="2025-06-01", pdf_url="u2", stage="metadata"))
        s.commit()
    target = tmp_path / "r1.pdf"
    target.write_bytes(b"fake")
    refresh.refresh_research_pdfs(
        candidate_codes=["sz000001"],
        directory=tmp_path,
        download_fn=lambda url, directory: str(Path(directory) / target.name),
        parse_fn=lambda path: "订单饱满正文",
    )
    with SessionLocal() as s:
        assert s.query(ResearchReport).filter_by(report_id="R1").one().stage == "parsed"
        assert s.query(ResearchReport).filter_by(report_id="R2").one().stage == "metadata"


def test_run_fundamental_refresh_can_include_research_steps(db_path, tmp_path):
    init_db()
    refresh.reset_state()

    target = tmp_path / "r1.pdf"
    target.write_bytes(b"fake")

    refresh.run_fundamental_refresh(
        financial_fn=lambda rd: [
            {
                "code": "sz000001",
                "report_date": "2025-03-31",
                "net_profit": 1.0e9,
                "net_profit_yoy": 60.0,
                "revenue": 5.0e9,
                "revenue_yoy": 30.0,
                "gross_margin": 25.0,
            }
        ],
        forecast_fn=lambda rd: [],
        express_fn=lambda rd: [],
        industries_fn=lambda: [],
        industry_hist_fn=lambda code: pd.DataFrame(),
        constituents_fn=lambda code: [],
        research_meta_fn=lambda: [
            {
                "report_id": "R1",
                "code": "sz000001",
                "name": "平安银行",
                "title": "订单饱满",
                "org": "测试证券",
                "published_at": "2025-06-01",
                "summary": "",
                "pdf_url": "u1",
            }
        ],
        candidate_screen_fn=lambda preset, params: [{"code": "sz000001"}],
        research_download_fn=lambda url, directory: str(target),
        research_parse_fn=lambda path: "订单饱满正文",
        research_directory=tmp_path,
    )

    group = refresh.STATE["fundamental"]
    assert group.steps[3].progress == 100
    assert group.steps[4].progress == 100
