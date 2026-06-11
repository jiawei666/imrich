from __future__ import annotations

from typing import Optional

import akshare as ak  # type: ignore
import pandas as pd

from app.data.fetch_kline import normalize_stock_code_for_sina


def _to_float(value: object) -> Optional[float]:
    try:
        if value is None or pd.isna(value):  # type: ignore[arg-type]
            return None
    except (TypeError, ValueError):
        pass
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _norm_code(raw: object) -> str:
    return normalize_stock_code_for_sina(str(raw).zfill(6))


def _to_date(report_date: str) -> str:
    if len(report_date) == 8 and report_date.isdigit():
        return f"{report_date[:4]}-{report_date[4:6]}-{report_date[6:]}"
    return report_date


def fetch_financial_reports(report_date: str) -> list[dict]:
    df = ak.stock_yjbb_em(date=report_date)
    rows: list[dict] = []
    for _, r in df.iterrows():
        rows.append({
            "code": _norm_code(r["股票代码"]),
            "report_date": _to_date(report_date),
            "net_profit": _to_float(r["净利润-净利润"]),
            "net_profit_yoy": _to_float(r["净利润-同比增长"]),
            "revenue": _to_float(r["营业总收入-营业总收入"]),
            "revenue_yoy": _to_float(r["营业总收入-同比增长"]),
            "gross_margin": _to_float(r["销售毛利率"]),
        })
    return rows


def fetch_forecasts(report_date: str) -> list[dict]:
    df = ak.stock_yjyg_em(date=report_date)
    rows: list[dict] = []
    for _, r in df.iterrows():
        rows.append({
            "code": _norm_code(r["股票代码"]),
            "report_date": _to_date(report_date),
            "source": "forecast",
            "indicator": str(r["预测指标"]) if pd.notna(r["预测指标"]) else None,
            "change_desc": str(r["业绩变动"]) if pd.notna(r["业绩变动"]) else None,
            "change_pct": _to_float(r["业绩变动幅度"]),
            "forecast_value": _to_float(r["预测数值"]),
            "prior_value": _to_float(r["上年同期值"]),
            "notice_date": str(r["公告日期"]) if pd.notna(r["公告日期"]) else None,
        })
    return rows


def fetch_express_reports(report_date: str) -> list[dict]:
    df = ak.stock_yjkb_em(date=report_date)
    rows: list[dict] = []
    for _, r in df.iterrows():
        rows.append({
            "code": _norm_code(r["股票代码"]),
            "report_date": _to_date(report_date),
            "source": "express",
            "net_profit": _to_float(r["净利润-净利润"]),
            "net_profit_yoy": _to_float(r["净利润-同比增长"]),
            "revenue": _to_float(r["营业收入-营业收入"]),
            "revenue_yoy": _to_float(r["营业收入-同比增长"]),
            "notice_date": str(r["公告日期"]) if pd.notna(r["公告日期"]) else None,
        })
    return rows


def get_sw_industries() -> list[dict]:
    df = ak.sw_index_second_info()
    return [{"code": str(r["行业代码"]), "name": str(r["行业名称"])} for _, r in df.iterrows()]


def get_industry_index_hist(code: str) -> pd.DataFrame:
    df = ak.index_hist_sw(symbol=code, period="day")
    if df.empty:
        return pd.DataFrame(columns=["date", "open", "close", "high", "low", "volume"])
    out = df.rename(
        columns={
            "日期": "date",
            "开盘": "open",
            "收盘": "close",
            "最高": "high",
            "最低": "low",
            "成交量": "volume",
        }
    )
    out["date"] = out["date"].astype(str)
    return out[["date", "open", "close", "high", "low", "volume"]].reset_index(drop=True)


def get_industry_constituents(code: str) -> list[str]:
    df = ak.index_component_sw(symbol=code)
    return [_norm_code(c) for c in df["证券代码"]]
