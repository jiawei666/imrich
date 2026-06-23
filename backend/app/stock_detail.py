from __future__ import annotations

import pandas as pd

from app.db import SessionLocal
from app.indicators import compute_kdj, compute_zhixing_short_trend, compute_zhixing_bull_bear
from app.models import FinancialReport, IndustryResearchReport, KlineDay, KlineMonth, KlineQuarter, KlineWeek, ResearchReport, Stock
from app.signals import compute_single_quarter_series
from fastapi import HTTPException

INDUSTRY_REPORT_ALIASES: dict[str, list[str]] = {
    "锂电池": ["电池"],
    "农商行Ⅱ": ["银行Ⅱ", "银行"],
    "国有大型银行Ⅱ": ["银行Ⅱ", "银行"],
    "城商行Ⅱ": ["银行Ⅱ", "银行"],
    "股份制银行Ⅱ": ["银行Ⅱ", "银行"],
    "出版": ["文化传媒"],
    "电视广播Ⅱ": ["文化传媒"],
    "地面兵装Ⅱ": ["航空装备Ⅱ", "航天装备Ⅱ"],
    "家电零部件Ⅱ": ["其他家电Ⅱ", "家电行业"],
    "林业Ⅱ": ["农牧饲渔"],
    "渔业": ["农牧饲渔"],
    "焦炭Ⅱ": ["煤炭开采", "煤炭行业"],
    "照明设备Ⅱ": ["光学光电子"],
    "特钢Ⅱ": ["普钢", "钢铁行业"],
    "调味发酵品Ⅱ": ["食品加工", "食品饮料"],
}


def _industry_report_names(sub_industry: str | None, parent_industry: str | None) -> list[str]:
    names: list[str] = []
    for name in (sub_industry, parent_industry):
        if not name:
            continue
        names.append(name)
        names.extend(INDUSTRY_REPORT_ALIASES.get(name, []))
    seen = set()
    return [name for name in names if not (name in seen or seen.add(name))]


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

    def _serialize(rows):
        """序列化 K 线行，并附加 KDJ / 黄白线指标。"""
        if not rows:
            return []
        df = pd.DataFrame(
            [(r.date, r.open, r.close, r.high, r.low, r.volume) for r in rows],
            columns=["date", "open", "close", "high", "low", "volume"],
        )
        kdj = compute_kdj(df)
        white = compute_zhixing_short_trend(df, span=10)
        yellow = compute_zhixing_bull_bear(df)

        def _round(x):
            return None if pd.isna(x) else round(float(x), 3)

        result = []
        for i in range(len(df)):
            result.append({
                "date": df["date"].iloc[i],
                "open": round(float(df["open"].iloc[i]), 2),
                "close": round(float(df["close"].iloc[i]), 2),
                "high": round(float(df["high"].iloc[i]), 2),
                "low": round(float(df["low"].iloc[i]), 2),
                "volume": round(float(df["volume"].iloc[i]), 2) if pd.notna(df["volume"].iloc[i]) else None,
                "k": _round(kdj["K"].iloc[i]),
                "d": _round(kdj["D"].iloc[i]),
                "j": _round(kdj["J"].iloc[i]),
                "whiteLine": _round(white.iloc[i]),
                "yellowLine": _round(yellow.iloc[i]),
            })
        return result

    return {
        "day": _serialize(day),
        "week": _serialize(week),
        "month": _serialize(month),
        "quarter": _serialize(quarter),
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

        parent_industry_name = stock.parent_industry
        stock_reports = (
            s.query(ResearchReport)
            .filter_by(code=code)
            .order_by(ResearchReport.published_at.desc())
            .limit(10)
            .all()
        )
        industry_report_rows = []
        for industry_name in _industry_report_names(stock.industry, stock.parent_industry):
            industry_report_rows = (
                s.query(IndustryResearchReport)
                .filter_by(industry=industry_name)
                .order_by(IndustryResearchReport.published_at.desc())
                .limit(10)
                .all()
            )
            if industry_report_rows:
                break

    def _quarter(report_date: str) -> str:
        y = report_date[:4]
        m = report_date[5:7]
        return f"{y}Q{int((int(m) - 1) // 3 + 1)}"

    klines = _load_klines(code)
    high_line = max((k["close"] for k in klines["day"]), default=10)

    return {
        "code": stock.code,
        "name": stock.name or stock.code,
        "industry": parent_industry_name or stock.industry or "",
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
            {"title": r.title, "org": r.org, "date": r.published_at, "pdfUrl": r.pdf_url}
            for r in stock_reports
        ],
        "industryReports": [
            {"title": r.title, "org": r.org, "date": r.published_at, "pdfUrl": r.pdf_url, "industry": r.industry}
            for r in industry_report_rows
        ],
    }
