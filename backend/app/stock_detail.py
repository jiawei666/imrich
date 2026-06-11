from __future__ import annotations

from fastapi import HTTPException

from app.db import SessionLocal
from app.kline_service import get_stock_kline
from app.models import FinancialReport, ResearchReport, Stock


def _quarter(report_date: str) -> str:
    suffix = {"03": "Q1", "06": "Q2", "09": "Q3", "12": "Q4"}[report_date[5:7]]
    return f"{report_date[:4]}{suffix}"


def get_stock_detail(code: str) -> dict:
    with SessionLocal() as s:
        stock = s.query(Stock).filter_by(code=code).one_or_none()
        if stock is None:
            raise HTTPException(status_code=404, detail="股票不存在")
        reports = s.query(ResearchReport).filter_by(code=code).order_by(ResearchReport.published_at.desc()).limit(10).all()
        financials = s.query(FinancialReport).filter_by(code=code).order_by(FinancialReport.report_date).all()

    kline_day = get_stock_kline(code, "day")
    kline_week = get_stock_kline(code, "week")
    kline_month = get_stock_kline(code, "month")
    kline_quarter = get_stock_kline(code, "quarter")
    latest = financials[-1] if financials else None
    return {
        "code": stock.code,
        "name": stock.name,
        "industry": stock.industry or "",
        "subIndustry": stock.industry or "",
        "score": 0,
        "scoreDelta": 0,
        "signals": [],
        "signalCount": 0,
        "price": kline_day["data"][-1]["close"] if kline_day["data"] else 0,
        "drawdownFromHigh": 0,
        "yearHigh": kline_day["highLine"],
        "yearHighDate": kline_day["highLabel"],
        "quarters": [
            {"quarter": _quarter(row.report_date), "netProfit": (row.net_profit or 0) / 100000000, "revenue": (row.revenue or 0) / 100000000}
            for row in financials
        ],
        "latestNote": "" if latest is None else f"{_quarter(latest.report_date)} 净利润同比 {latest.net_profit_yoy or 0:.1f}%　营收同比 {latest.revenue_yoy or 0:.1f}%",
        "klineDay": kline_day["data"],
        "klineWeek": kline_week["data"],
        "klineMonth": kline_month["data"],
        "klineQuarter": kline_quarter["data"],
        "highLine": kline_day["highLine"],
        "reports": [{"title": row.title, "org": row.org or "", "date": row.published_at} for row in reports],
        "risks": [
            {"label": "业绩持续下滑", "ok": True},
            {"label": "股价创历史新低", "ok": True},
            {"label": "行业景气下行", "ok": True},
        ],
    }
