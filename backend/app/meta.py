from __future__ import annotations

from app.db import SessionLocal
from app.models import FinancialReport, Forecast, IndustryIndex, KlineDay, ResearchReport, Stock


def _quarter(report_date: str | None) -> str | None:
    if not report_date:
        return None
    month = report_date[5:7]
    q = {"03": "Q1", "06": "Q2", "09": "Q3", "12": "Q4"}.get(month)
    return f"{report_date[:4]}{q}" if q else None


def get_meta() -> dict:
    with SessionLocal() as s:
        stock_updated = s.query(Stock.updated_at).order_by(Stock.updated_at.desc()).limit(1).scalar()
        kline_date = s.query(KlineDay.date).order_by(KlineDay.date.desc()).limit(1).scalar()
        financial = (
            s.query(FinancialReport.report_date, FinancialReport.updated_at)
            .order_by(FinancialReport.report_date.desc(), FinancialReport.updated_at.desc())
            .first()
        )
        forecast_updated = s.query(Forecast.updated_at).order_by(Forecast.updated_at.desc()).limit(1).scalar()
        industry_date = s.query(IndustryIndex.date).order_by(IndustryIndex.date.desc()).limit(1).scalar()
        research_updated = s.query(ResearchReport.updated_at).order_by(ResearchReport.updated_at.desc()).limit(1).scalar()
        parsed_count = s.query(ResearchReport).filter(ResearchReport.stage == "parsed").count()
    return {
        "stockList": {"updatedAt": stock_updated},
        "klineDay": {"updatedAt": kline_date},
        "financialReports": {
            "updatedAt": financial.updated_at if financial else None,
            "reportPeriod": _quarter(financial.report_date if financial else None),
        },
        "forecasts": {"updatedAt": forecast_updated},
        "industryIndex": {"updatedAt": industry_date},
        "researchReports": {"stage1UpdatedAt": research_updated, "stage2CandidateCount": parsed_count},
    }
