from __future__ import annotations

from typing import Any

from app.db import SessionLocal
from app.models import FinancialReport, Forecast, IndustryIndex, KlineDay, ResearchReport, Stock
from app.pool_filters import filter_default_pool
from app.research_signals import alpha_rank, has_research_keyword, keyword_hits, sector_effect
from app.signals import (
    beat_expect,
    high_growth,
    industry_new_high,
    low_position_oversold,
    price_new_high,
    profit_new_high,
    risk_industry_down,
    risk_price_new_low,
    risk_profit_decline,
)


def _latest_by_code(rows: list[Any], attr: str = "report_date") -> dict[str, Any]:
    out: dict[str, Any] = {}
    for row in rows:
        code = row.code
        if code not in out or getattr(row, attr) > getattr(out[code], attr):
            out[code] = row
    return out


def _group_by_code(rows: list[Any]) -> dict[str, list[Any]]:
    out: dict[str, list[Any]] = {}
    for row in rows:
        out.setdefault(row.code, []).append(row)
    return out


def build_fundamental_rows(params: dict) -> list[dict]:
    with SessionLocal() as s:
        stocks = s.query(Stock).filter(Stock.delisted_at.is_(None)).all()
        reports = s.query(FinancialReport).order_by(FinancialReport.report_date).all()
        forecasts = s.query(Forecast).all()
        industry_rows = s.query(IndustryIndex).order_by(IndustryIndex.code, IndustryIndex.date).all()
        research = s.query(ResearchReport).all()
        klines = s.query(KlineDay).order_by(KlineDay.code, KlineDay.date).all()

    latest_report = _latest_by_code(reports)
    reports_by_code = _group_by_code(reports)
    forecasts_by_code = _group_by_code(forecasts)
    research_by_code = _group_by_code(research)
    klines_by_code = _group_by_code(klines)
    industry_by_name: dict[str, list[IndustryIndex]] = {}
    for row in industry_rows:
        industry_by_name.setdefault(row.name, []).append(row)

    as_of = max((row.date for row in klines), default="1970-01-01")
    allowed = {
        row["code"]
        for row in filter_default_pool(
            [
                {
                    "code": stock.code,
                    "is_st": stock.is_st,
                    "is_bj": stock.is_bj,
                    "delisted_at": stock.delisted_at,
                    "listed_at": stock.listed_at,
                }
                for stock in stocks
            ],
            as_of,
        )
    }

    rows: list[dict] = []
    for stock in stocks:
        if stock.code not in allowed:
            continue
        financial = latest_report.get(stock.code)
        if financial is None:
            continue
        stock_klines = klines_by_code.get(stock.code, [])
        closes = [float(row.close) for row in stock_klines]
        report_history = reports_by_code.get(stock.code, [])
        yoy_history = [row.net_profit_yoy for row in report_history[:-1]]
        research_rows = research_by_code.get(stock.code, [])
        forecast_rows = forecasts_by_code.get(stock.code, [])
        forecast_change = next((row.change_pct for row in forecast_rows if row.change_pct is not None), None)
        research_hit = has_research_keyword(
            [
                {
                    "published_at": row.published_at,
                    "title": row.title,
                    "summary": row.summary,
                    "content_text": row.content_text,
                }
                for row in research_rows
            ],
            as_of=as_of,
            window_days=int(params.get("keywordWindow", 90)),
        ) if research_rows else False
        text = "\n".join(f"{row.title}\n{row.summary or ''}\n{row.content_text or ''}" for row in research_rows)
        industry_hist = industry_by_name.get(stock.industry or "", [])
        industry_closes = [float(row.close) for row in industry_hist]
        drawdown_from_high = 0.0
        if closes:
            peak = max(closes)
            if peak > 0:
                drawdown_from_high = 1 - closes[-1] / peak
        rows.append(
            {
                "code": stock.code,
                "name": stock.name,
                "industry": stock.industry or "",
                "high_growth": high_growth(financial.net_profit_yoy, threshold=float(params.get("netProfitYoY", 50))),
                "beat_expect": beat_expect(financial.net_profit_yoy, history_yoys=yoy_history, forecast_change_pct=forecast_change),
                "profit_record": profit_new_high([row.net_profit for row in report_history]),
                "price_new_high": price_new_high(closes),
                "industry_new_high": industry_new_high(industry_closes),
                "research_signals": keyword_hits(text),
                "research_hit": research_hit,
                "sector_effect": False,
                "alpha": False,
                "oversold": low_position_oversold(
                    closes, financial.net_profit_yoy,
                    drawdown_threshold=float(params.get("drawdownMin", 35)) / 100,
                    yoy_threshold=float(params.get("netProfitYoY", 0)),
                ),
                "risk_profit_decline": risk_profit_decline(report_history),
                "risk_price_new_low": risk_price_new_low(closes),
                "risk_industry_down": risk_industry_down(industry_closes),
                "netProfitYoY": financial.net_profit_yoy or 0,
                "revenueYoY": financial.revenue_yoy or 0,
                "market_cap": stock.market_cap or 0,
                "return_pct": ((closes[-1] - closes[0]) / closes[0] * 100) if len(closes) >= 2 and closes[0] else 0,
                "drawdown_from_high": drawdown_from_high,
            }
        )

    # 行业过滤（在 sector_effect/alpha 计算之前）
    if params.get("industry"):
        rows = [r for r in rows if r["industry"] == params["industry"]]

    for row in rows:
        row["sector_effect"] = sector_effect(row["industry"], rows)
        row["alpha"] = alpha_rank(row["code"], rows)
    return rows
