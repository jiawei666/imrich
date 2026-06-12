from __future__ import annotations

import time
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, List, Optional

import pandas as pd

from app.db import SessionLocal
from app.models import (
    FinancialReport,
    Forecast,
    IndustryIndex,
    KlineDay,
    ResearchReport,
    KlineMonth,
    KlineQuarter,
    KlineWeek,
    Stock,
)
from app.data.resample import resample_ohlcv

DEFAULT_MIN_CAP = 0  # 不限制市值


@dataclass
class RefreshStep:
    label: str
    done: int = 0
    total: int = 0
    elapsed: str = "00:00"
    progress: int = 0


@dataclass
class RefreshGroup:
    status: str = "idle"  # idle|running|done|error
    updatedAt: Optional[str] = None
    error: Optional[str] = None
    steps: List[RefreshStep] = field(default_factory=list)


def _new_state():
    return {
        "kline": RefreshGroup(steps=[
            RefreshStep("股票列表"), RefreshStep("K线数据（日+周+月+季）")]),
        "fundamental": RefreshGroup(steps=[
            RefreshStep("财报数据"), RefreshStep("业绩预告快报"),
            RefreshStep("申万行业指数"), RefreshStep("研报-全市场元数据"),
            RefreshStep("研报-候选池解析")]),
    }


STATE = _new_state()


def reset_state() -> None:
    global STATE
    STATE = _new_state()


def _fmt(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


_PERIOD_MODELS = {"week": KlineWeek, "month": KlineMonth, "quarter": KlineQuarter}


def run_kline_refresh(
    reload_stock_list: bool = True,
    constituents_fn: Optional[Callable[[], list]] = None,
    kline_fn: Optional[Callable[[str], pd.DataFrame]] = None,
) -> None:
    """任务组A：股票列表 diff + 日K全量重抓 + 周/月/季K重采样。

    Args:
        reload_stock_list: 是否重新加载股票列表。False 则跳过步骤1，直接用现有股票列表刷新K线。
    """
    if constituents_fn is None:
        from app.data.fetch_kline import get_constituents
        constituents_fn = lambda: get_constituents(DEFAULT_MIN_CAP)
    if kline_fn is None:
        from app.data.fetch_kline import get_kline_ak_tx
        kline_fn = lambda code: get_kline_ak_tx(code, "", "")

    group = STATE["kline"]
    group.status = "running"
    started = time.time()

    try:
        # —— 步骤1：股票列表（可选跳过） ——
        step1 = group.steps[0]
        if reload_stock_list:
            rows = constituents_fn()
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with SessionLocal() as s:
                current_codes = set()
                for r in rows:
                    current_codes.add(r["code"])
                    obj = s.get(Stock, r["code"])
                    if obj is None:
                        obj = Stock(code=r["code"])
                        s.add(obj)
                    obj.name = r["name"]
                    obj.market_cap = r.get("market_cap")
                    obj.delisted_at = None
                    obj.updated_at = now
                # 退市软删除
                for obj in s.query(Stock).all():
                    if obj.code not in current_codes and obj.delisted_at is None:
                        obj.delisted_at = now
                s.commit()
            step1.total = step1.done = len(rows)
            step1.progress = 100
            step1.elapsed = _fmt(time.time() - started)
        else:
            # 跳过股票列表刷新，从数据库读取现有股票
            with SessionLocal() as s:
                rows = [
                    {"code": obj.code, "name": obj.name, "market_cap": obj.market_cap}
                    for obj in s.query(Stock).filter(Stock.delisted_at.is_(None)).all()
                ]
            step1.total = step1.done = len(rows)
            step1.progress = 100
            step1.elapsed = "跳过"

        # —— 步骤2：K线全量重抓 + 重采样 ——
        step2 = group.steps[1]
        active = [r["code"] for r in rows]
        step2.total = len(active)
        t0 = time.time()
        for i, code in enumerate(active, 1):
            df = kline_fn(code)
            with SessionLocal() as s:
                s.query(KlineDay).filter_by(code=code).delete()
                if df is not None and not df.empty:
                    s.bulk_save_objects([
                        KlineDay(code=code, date=pd.Timestamp(row.date).strftime("%Y-%m-%d"),
                                 open=float(row.open), close=float(row.close),
                                 high=float(row.high), low=float(row.low),
                                 volume=float(row.volume))
                        for row in df.itertuples(index=False)
                    ])
                for period, model in _PERIOD_MODELS.items():
                    s.query(model).filter_by(code=code).delete()
                    if df is not None and not df.empty:
                        rs = resample_ohlcv(df, period)
                        s.bulk_save_objects([
                            model(code=code, date=row.date, open=float(row.open),
                                  close=float(row.close), high=float(row.high),
                                  low=float(row.low), volume=float(row.volume))
                            for row in rs.itertuples(index=False)
                        ])
                s.commit()
            step2.done = i
            step2.progress = int(i / step2.total * 100) if step2.total else 100
            step2.elapsed = _fmt(time.time() - t0)

        group.status = "done"
        group.updatedAt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        group.status = "error"
        group.error = str(e)
        raise


def _latest_report_date(now: Optional[datetime] = None) -> str:
    now = now or datetime.now()
    year = now.year
    quarter_ends = [("1231", datetime(year - 1, 12, 31)), ("0331", datetime(year, 3, 31)),
                    ("0630", datetime(year, 6, 30)), ("0930", datetime(year, 9, 30)),
                    ("1231", datetime(year, 12, 31))]
    latest = "1231"
    latest_year = year - 1
    for suffix, dt in quarter_ends:
        if now >= dt:
            latest = suffix
            latest_year = dt.year
    return f"{latest_year}{latest}"


def _refresh_financial_reports(group: RefreshGroup, financial_fn: Callable[[str], list]) -> None:
    step = group.steps[0]
    report_date = _latest_report_date()
    rows = financial_fn(report_date)
    step.total = len(rows)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with SessionLocal() as s:
        for i, row in enumerate(rows, 1):
            obj = (
                s.query(FinancialReport)
                .filter_by(code=row["code"], report_date=row["report_date"])
                .one_or_none()
            )
            if obj is None:
                obj = FinancialReport(code=row["code"], report_date=row["report_date"])
                s.add(obj)
            obj.net_profit = row.get("net_profit")
            obj.net_profit_yoy = row.get("net_profit_yoy")
            obj.revenue = row.get("revenue")
            obj.revenue_yoy = row.get("revenue_yoy")
            obj.gross_margin = row.get("gross_margin")
            obj.updated_at = now
            step.done = i
        s.commit()
    step.progress = 100 if step.total or step.done == 0 else int(step.done / step.total * 100)
    step.elapsed = "00:00"


def _refresh_forecasts(
    group: RefreshGroup,
    forecast_fn: Callable[[str], list],
    express_fn: Callable[[str], list],
) -> None:
    step = group.steps[1]
    report_date = _latest_report_date()
    rows = forecast_fn(report_date) + express_fn(report_date)
    step.total = len(rows)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with SessionLocal() as s:
        for i, row in enumerate(rows, 1):
            obj = (
                s.query(Forecast)
                .filter_by(code=row["code"], report_date=row["report_date"], source=row["source"])
                .one_or_none()
            )
            if obj is None:
                obj = Forecast(code=row["code"], report_date=row["report_date"], source=row["source"])
                s.add(obj)
            obj.indicator = row.get("indicator")
            obj.change_desc = row.get("change_desc")
            obj.change_pct = row.get("change_pct")
            obj.forecast_value = row.get("forecast_value")
            obj.prior_value = row.get("prior_value")
            obj.net_profit = row.get("net_profit")
            obj.net_profit_yoy = row.get("net_profit_yoy")
            obj.revenue = row.get("revenue")
            obj.revenue_yoy = row.get("revenue_yoy")
            obj.notice_date = row.get("notice_date")
            obj.updated_at = now
            step.done = i
        s.commit()
    step.progress = 100 if step.total or step.done == 0 else int(step.done / step.total * 100)
    step.elapsed = "00:00"


def _refresh_industry_index(
    group: RefreshGroup,
    industries_fn: Callable[[], list],
    industry_hist_fn: Callable[[str], pd.DataFrame],
    constituents_fn: Callable[[str], list],
) -> None:
    step = group.steps[2]
    industries = industries_fn()
    step.total = len(industries)
    with SessionLocal() as s:
        for i, industry in enumerate(industries, 1):
            hist = industry_hist_fn(industry["code"])
            for row in hist.to_dict("records"):
                obj = (
                    s.query(IndustryIndex)
                    .filter_by(code=industry["code"], date=row["date"])
                    .one_or_none()
                )
                if obj is None:
                    obj = IndustryIndex(code=industry["code"], date=row["date"], name=industry["name"], open=0, close=0, high=0, low=0, volume=0)
                    s.add(obj)
                obj.name = industry["name"]
                obj.open = float(row["open"])
                obj.close = float(row["close"])
                obj.high = float(row["high"])
                obj.low = float(row["low"])
                obj.volume = float(row["volume"])
            for code in constituents_fn(industry["code"]):
                stock = s.get(Stock, code)
                if stock is None:
                    stock = Stock(code=code, name="", is_st=False, is_bj=code.startswith("bj"))
                    s.add(stock)
                stock.industry = industry["name"]
            step.done = i
        s.commit()
    step.progress = 100 if step.total or step.done == 0 else int(step.done / step.total * 100)
    step.elapsed = "00:00"


def run_fundamental_refresh(
    financial_fn: Optional[Callable[[str], list]] = None,
    forecast_fn: Optional[Callable[[str], list]] = None,
    express_fn: Optional[Callable[[str], list]] = None,
    industries_fn: Optional[Callable[[], list]] = None,
    industry_hist_fn: Optional[Callable[[str], pd.DataFrame]] = None,
    constituents_fn: Optional[Callable[[str], list]] = None,
    research_meta_fn: Optional[Callable[[], list[dict]]] = None,
    candidate_screen_fn: Optional[Callable[[str, dict], list[dict]]] = None,
    research_download_fn: Optional[Callable[[str, Path], str]] = None,
    research_parse_fn: Optional[Callable[[str], str]] = None,
    research_directory: Optional[Path] = None,
) -> None:
    if financial_fn is None:
        from app.data.fetch_fundamental import fetch_financial_reports

        financial_fn = fetch_financial_reports
    if forecast_fn is None:
        from app.data.fetch_fundamental import fetch_forecasts

        forecast_fn = fetch_forecasts
    if express_fn is None:
        from app.data.fetch_fundamental import fetch_express_reports

        express_fn = fetch_express_reports
    if industries_fn is None:
        from app.data.fetch_fundamental import get_sw_industries

        industries_fn = get_sw_industries
    if industry_hist_fn is None:
        from app.data.fetch_fundamental import get_industry_index_hist

        industry_hist_fn = get_industry_index_hist
    if constituents_fn is None:
        from app.data.fetch_fundamental import get_industry_constituents

        constituents_fn = get_industry_constituents
    if research_meta_fn is None and candidate_screen_fn is None and research_download_fn is None and research_parse_fn is None:
        include_research = False
    else:
        include_research = True
    if include_research:
        if research_meta_fn is None:
            from app.data.fetch_research import fetch_research_metadata

            research_meta_fn = fetch_research_metadata
        if candidate_screen_fn is None:
            from app.fundamental_screen import run_fundamental_screen

            candidate_screen_fn = run_fundamental_screen
        if research_download_fn is None:
            from app.data.fetch_research import download_pdf

            research_download_fn = download_pdf
        if research_parse_fn is None:
            from app.data.fetch_research import parse_pdf_text

            research_parse_fn = parse_pdf_text
        if research_directory is None:
            research_directory = Path("backend/data/research")

    group = STATE["fundamental"]
    group.status = "running"
    try:
        _refresh_financial_reports(group, financial_fn)
        _refresh_forecasts(group, forecast_fn, express_fn)
        _refresh_industry_index(group, industries_fn, industry_hist_fn, constituents_fn)
        if include_research and research_meta_fn and candidate_screen_fn and research_download_fn and research_parse_fn and research_directory:
            refresh_research_metadata(research_meta_fn, group=group)
            candidate_codes = [row["code"] for row in candidate_screen_fn("super-growth", {})[:200]]
            candidate_codes += [row["code"] for row in candidate_screen_fn("oversold-bluechip", {})[:200]]
            refresh_research_pdfs(
                sorted(set(candidate_codes)),
                research_directory,
                download_fn=research_download_fn,
                parse_fn=research_parse_fn,
                group=group,
            )
        group.status = "done"
        group.updatedAt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        group.status = "error"
        group.error = str(e)
        raise


def refresh_research_metadata(fetch_fn: Callable[[], list[dict]], group: Optional[RefreshGroup] = None) -> None:
    rows = fetch_fn()
    step = group.steps[3] if group is not None else None
    if step is not None:
        step.total = len(rows)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with SessionLocal() as s:
        for i, row in enumerate(rows, 1):
            obj = s.query(ResearchReport).filter_by(report_id=row["report_id"]).one_or_none()
            if obj is None:
                obj = ResearchReport(report_id=row["report_id"], code=row["code"], title=row["title"], published_at=row["published_at"], stage="metadata")
                s.add(obj)
            obj.code = row["code"]
            obj.name = row.get("name")
            obj.title = row["title"]
            obj.org = row.get("org")
            obj.published_at = row["published_at"]
            obj.summary = row.get("summary")
            obj.pdf_url = row.get("pdf_url")
            obj.updated_at = now
            if step is not None:
                step.done = i
        s.commit()
    if step is not None:
        step.progress = 100 if step.total or step.done == 0 else int(step.done / step.total * 100)
        step.elapsed = "00:00"


def refresh_research_pdfs(
    candidate_codes: list[str],
    directory: Path,
    download_fn: Callable[[str, Path], str],
    parse_fn: Callable[[str], str],
    group: Optional[RefreshGroup] = None,
) -> None:
    step = group.steps[4] if group is not None else None
    with SessionLocal() as s:
        rows = (
            s.query(ResearchReport)
            .filter(ResearchReport.code.in_(candidate_codes), ResearchReport.stage != "parsed")
            .all()
        )
        if step is not None:
            step.total = len(rows)
        for i, row in enumerate(rows, 1):
            if not row.pdf_url:
                continue
            pdf_path = download_fn(row.pdf_url, directory)
            row.pdf_path = pdf_path
            row.content_text = parse_fn(pdf_path)
            row.stage = "parsed"
            row.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            if step is not None:
                step.done = i
        s.commit()
    if step is not None:
        step.progress = 100 if step.total or step.done == 0 else int(step.done / step.total * 100)
        step.elapsed = "00:00"


def get_status_snapshot() -> dict:
    """返回 STATE 的序列化快照，并用数据库实际入库量回填进度。"""
    from app.db import SessionLocal
    from app.models import Stock, KlineDay

    def _grp(g):
        return {"status": g.status, "updatedAt": g.updatedAt,
                "error": g.error, "steps": [vars(s) for s in g.steps]}

    result = {k: _grp(v) for k, v in STATE.items()}

    with SessionLocal() as s:
        stock_count = s.query(Stock).filter(Stock.delisted_at.is_(None)).count()
        kline_stock_count = s.query(KlineDay).group_by(KlineDay.code).count()

    kline_steps = result["kline"]["steps"]

    if stock_count > 0:
        kline_steps[0]["total"] = max(kline_steps[0]["total"], stock_count)
        kline_steps[0]["done"] = stock_count
        kline_steps[0]["progress"] = int(stock_count / kline_steps[0]["total"] * 100)

    if stock_count > 0:
        kline_steps[1]["total"] = max(kline_steps[1]["total"], stock_count)
        kline_steps[1]["done"] = kline_stock_count
        kline_steps[1]["progress"] = int(kline_stock_count / stock_count * 100)

    return result
