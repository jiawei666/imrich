from __future__ import annotations

from app.db import SessionLocal
from app.models import FinancialReport, KlineDay, KlineMonth, KlineQuarter, KlineWeek, ResearchReport, Stock
from app.signals import compute_single_quarter_series
from fastapi import HTTPException


def _load_klines(code: str) -> dict:
    with SessionLocal() as s:
        day = (
            s.query(KlineDay)
            .filter_by(code=code)
            .order_by(KlineDay.date)
            .all()
        )
        week = (
            s.query(KlineWeek)
            .filter_by(code=code)
            .order_by(KlineWeek.date)
            .all()
        )
        month = (
            s.query(KlineMonth)
            .filter_by(code=code)
            .order_by(KlineMonth.date)
            .all()
        )
        quarter = (
            s.query(KlineQuarter)
            .filter_by(code=code)
            .order_by(KlineQuarter.date)
            .all()
        )
    return {
        "day": [{"date": r.date, "open": r.open, "close": r.close, "high": r.high, "low": r.low, "volume": r.volume} for r in day],
        "week": [{"date": r.date, "open": r.open, "close": r.close, "high": r.high, "low": r.low, "volume": r.volume} for r in week],
        "month": [{"date": r.date, "open": r.open, "close": r.close, "high": r.high, "low": r.low, "volume": r.volume} for r in month],
        "quarter": [{"date": r.date, "open": r.open, "close": r.close, "high": r.high, "low": r.low, "volume": r.volume} for r in quarter],
    }


def get_stock_detail(code: str):
    with SessionLocal() as s:
        stock = s.get(Stock, code)
        if stock is None:
            raise HTTPException(status_code=404, detail="股票不存在")
        financials = (
            s.query(FinancialReport)
            .filter_by(code=code)
            .order_by(FinancialReport.report_date)
            .all()
        )
        report_dates = [row.report_date for row in financials]
        net_profit_q = compute_single_quarter_series(
            report_dates, [row.net_profit for row in financials]
        )
        revenue_q = compute_single_quarter_series(
            report_dates, [row.revenue for row in financials]
        )

    def _quarter(report_date: str) -> str:
        y = report_date[:4]
        m = report_date[5:7]
        return f"{y}Q{int((int(m) - 1) // 3 + 1)}"

    klines = _load_klines(code)
    high_line = max((k["close"] for k in klines["day"]), default=10)

    return {
        "code": stock.code,
        "name": stock.name or stock.code,
        "industry": stock.industry or "",
        "subIndustry": stock.industry or "",
        "price": klines["day"][-1]["close"] if klines["day"] else 10,
        "yearHigh": high_line,
        "yearHighDate": max((k["date"] for k in klines["day"]), default="") if klines["day"] else "",
        "quarters": [
            {
                "quarter": _quarter(row.report_date),
                "netProfit": (row.net_profit or 0) / 1e8,
                "revenue": (row.revenue or 0) / 1e8,
                "netProfitQuarterly": (net_profit_q[i] / 1e8) if net_profit_q[i] is not None else None,
                "revenueQuarterly": (revenue_q[i] / 1e8) if revenue_q[i] is not None else None,
            }
            for i, row in enumerate(financials)
        ],
        "latestNote": (
            f"{_quarter(financials[-1].report_date)} 净利润同比 {financials[-1].net_profit_yoy or 0:.1f}%　营收同比 {financials[-1].revenue_yoy or 0:.1f}%"
            if financials
            else ""
        ),
        "klineDay": klines["day"],
        "klineWeek": klines["week"],
        "klineMonth": klines["month"],
        "klineQuarter": klines["quarter"],
        "highLine": high_line,
        "reports": [
            {"title": r.title, "org": r.org, "date": r.published_at}
            for r in s.query(ResearchReport)
            .filter_by(code=code, stage="parsed")
            .order_by(ResearchReport.published_at.desc())
            .limit(10)
            .all()
        ],
    }
