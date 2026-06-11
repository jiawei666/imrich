import pytest
from sqlalchemy.exc import IntegrityError

from app.db import SessionLocal, init_db
from app.models import ResearchReport


def test_research_reports_table_accepts_stage1_and_stage2_rows(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(
            ResearchReport(
                report_id="em-1",
                code="sz000001",
                name="平安银行",
                title="订单饱满，业绩超预期",
                org="测试证券",
                published_at="2025-06-01",
                summary="新产品放量，国产替代加速",
                pdf_url="https://example.test/a.pdf",
                pdf_path=None,
                content_text=None,
                stage="metadata",
                updated_at="2025-06-02 10:00:00",
            )
        )
        s.commit()
        row = s.query(ResearchReport).filter_by(report_id="em-1").one()
        row.stage = "parsed"
        row.pdf_path = "data/research/em-1.pdf"
        row.content_text = "正文：订单饱满，产能扩张。"
        s.commit()

    with SessionLocal() as s:
        row = s.query(ResearchReport).filter_by(report_id="em-1").one()
        assert row.stage == "parsed"
        assert "产能扩张" in row.content_text


def test_research_report_id_is_unique(db_path):
    init_db()
    with SessionLocal() as s:
        s.add(ResearchReport(report_id="dup", code="sz000001", title="a", published_at="2025-06-01", stage="metadata"))
        s.add(ResearchReport(report_id="dup", code="sz000001", title="b", published_at="2025-06-02", stage="metadata"))
        with pytest.raises(IntegrityError):
            s.commit()
