from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Callable, List, Optional

import pandas as pd
from tqdm import tqdm

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

logger = logging.getLogger(__name__)

DEFAULT_MIN_CAP = 0  # 不限制市值

# 研报抓取/下载的并发度：I/O 等待为主，适度并发可大幅缩短全量股票的耗时；
# 同时控制在较小值以避免触发数据源的限速/封禁。
RESEARCH_META_WORKERS = 8
RESEARCH_PDF_WORKERS = 4


@dataclass
class RefreshStep:
    label: str
    status: str = "idle"      # idle | running | done | error
    error: Optional[str] = None
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
            RefreshStep("申万行业指数"), RefreshStep("研报元数据"),
            RefreshStep("研报PDF解析")]),
    }


STATE = _new_state()
_cancel_flag = False


def request_cancel() -> None:
    """标记取消，运行中的刷新循环应在下次迭代时退出。"""
    global _cancel_flag
    _cancel_flag = True


def reset_state() -> None:
    global STATE, _cancel_flag
    STATE = _new_state()
    _cancel_flag = False


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
        # 占位，等 step1 可用后再构建带回调的版本
        constituents_fn = "default"
    if kline_fn is None:
        from app.data.fetch_kline import get_kline_ak_tx
        kline_fn = lambda code: get_kline_ak_tx(code, "", "")

    group = STATE["kline"]
    group.status = "running"
    started = time.time()

    try:
        # —— 步骤1：股票列表（可选跳过） ——
        step1 = group.steps[0]
        if constituents_fn == "default":
            from app.data.fetch_kline import get_constituents
            def _on_page(current, total):
                if total > 0:
                    step1.total = total
                    step1.done = current
                    step1.progress = int(current / total * 100)
                    step1.elapsed = _fmt(time.time() - started)
            constituents_fn = lambda: get_constituents(DEFAULT_MIN_CAP, progress_callback=_on_page)
        if reload_stock_list:
            rows = constituents_fn()
            # 分页抓取阶段已由 progress_callback 更新进度；写入数据库极快，直接标记完成
            step1.total = step1.done = len(rows)
            step1.progress = 100
            step1.elapsed = _fmt(time.time() - started)
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            with SessionLocal() as s:
                current_codes = set()
                for r in tqdm(rows, desc="股票列表写库"):
                    if _cancel_flag:
                        group.status = "done"
                        group.error = "服务关闭，任务中断"
                        return
                    current_codes.add(r["code"])
                    obj = s.get(Stock, r["code"])
                    if obj is None:
                        obj = Stock(code=r["code"], is_bj=r["code"].startswith("bj"))
                        s.add(obj)
                    obj.name = r["name"]
                    obj.market_cap = r.get("market_cap")
                    obj.is_bj = r["code"].startswith("bj")
                    obj.delisted_at = None
                    obj.updated_at = now
                # 退市软删除
                for obj in s.query(Stock).all():
                    if obj.code not in current_codes and obj.delisted_at is None:
                        obj.delisted_at = now
                s.commit()
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
        step2.done = 0
        step2.progress = 0
        active = [r["code"] for r in rows]
        step2.total = len(active)
        t0 = time.time()
        for i, code in enumerate(tqdm(active, desc="K线数据刷新（日+周+月+季）"), 1):
            if _cancel_flag:
                group.status = "done"
                group.error = "服务关闭，任务中断"
                return
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
    return _recent_report_dates(now)[-1]


def _recent_report_dates(now: Optional[datetime] = None) -> list[str]:
    """返回最近两年（8 个季度）的 report_date 列表，从早到晚排列。

    例如 2026-06 → ["20240331", "20240630", "20240930", "20241231",
                      "20250331", "20250630", "20250930", "20251231"]
    """
    now = now or datetime.now()
    # 所有可能的季度截止日（year-2 Q1 … year Q4）
    dates: list[str] = []
    for y in (now.year - 2, now.year - 1, now.year):
        for suffix, dt in [("0331", datetime(y, 3, 31)), ("0630", datetime(y, 6, 30)),
                           ("0930", datetime(y, 9, 30)), ("1231", datetime(y, 12, 31))]:
            if now >= dt:
                dates.append(f"{y}{suffix}")
    # 只取最近 8 个
    return dates[-8:]


def _refresh_financial_reports(group: RefreshGroup, financial_fn: Callable[[str], list]) -> None:
    step = group.steps[0]
    report_dates = _recent_report_dates()
    n_periods = len(report_dates)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    total_rows = 0
    step.done = 0
    step.total = 0
    step.progress = 0
    for period_idx, rd in enumerate(report_dates, 1):
        rows = financial_fn(rd)
        with SessionLocal() as s:
            for i, row in enumerate(tqdm(rows, desc=f"财报数据 {rd}"), 1):
                obj = (
                    s.query(FinancialReport)
                    .filter_by(code=row["code"], report_date=row["report_date"])
                    .one_or_none()
                )
                if obj is None:
                    obj = FinancialReport(code=row["code"], report_date=row["report_date"])
                    s.add(obj)
                    s.flush()
                obj.net_profit = row.get("net_profit")
                obj.net_profit_yoy = row.get("net_profit_yoy")
                obj.revenue = row.get("revenue")
                obj.revenue_yoy = row.get("revenue_yoy")
                obj.gross_margin = row.get("gross_margin")
                obj.updated_at = now
                step.done = total_rows + i
            s.commit()
        total_rows += len(rows)
        step.total = total_rows  # 预估总数随每期更新
        step.progress = int(period_idx / n_periods * 100)
    step.progress = 100
    step.elapsed = "00:00"


def _refresh_forecasts(
    group: RefreshGroup,
    forecast_fn: Callable[[str], list],
    express_fn: Callable[[str], list],
) -> None:
    step = group.steps[1]
    report_dates = _recent_report_dates()
    n_periods = len(report_dates)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    total_rows = 0
    step.done = 0
    step.total = 0
    step.progress = 0
    for period_idx, rd in enumerate(report_dates, 1):
        rows = forecast_fn(rd) + express_fn(rd)
        with SessionLocal() as s:
            for i, row in enumerate(tqdm(rows, desc=f"业绩预告快报 {rd}"), 1):
                obj = (
                    s.query(Forecast)
                    .filter_by(code=row["code"], report_date=row["report_date"], source=row["source"], indicator=row.get("indicator"))
                    .one_or_none()
                )
                if obj is None:
                    obj = Forecast(code=row["code"], report_date=row["report_date"], source=row["source"], indicator=row.get("indicator"))
                    s.add(obj)
                    s.flush()
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
                step.done = total_rows + i
            s.commit()
        total_rows += len(rows)
        step.total = total_rows
        step.progress = int(period_idx / n_periods * 100)
    step.progress = 100
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
    step.done = 0
    step.progress = 0
    for i, industry in enumerate(tqdm(industries, desc="申万行业指数"), 1):
        try:
            hist = industry_hist_fn(industry["code"])
            constituents = constituents_fn(industry["code"])
        except Exception:
            logger.warning("申万行业 %s(%s) 抓取失败，跳过", industry["name"], industry["code"], exc_info=True)
            step.done = i
            step.progress = int(i / step.total * 100) if step.total else 100
            continue
        with SessionLocal() as s:
            for row in hist.to_dict("records"):
                obj = (
                    s.query(IndustryIndex)
                    .filter_by(code=industry["code"], date=row["date"])
                    .one_or_none()
                )
                if obj is None:
                    obj = IndustryIndex(code=industry["code"], date=row["date"], name=industry["name"], open=0, close=0, high=0, low=0, volume=0)
                    s.add(obj)
                    s.flush()
                obj.name = industry["name"]
                obj.open = float(row["open"])
                obj.close = float(row["close"])
                obj.high = float(row["high"])
                obj.low = float(row["low"])
                obj.volume = float(row["volume"])
            for code in constituents:
                stock = s.get(Stock, code)
                if stock is None:
                    stock = Stock(code=code, name="", is_st=False, is_bj=code.startswith("bj"))
                    s.add(stock)
                stock.industry = industry["name"]
            s.commit()
        step.done = i
        step.progress = int(i / step.total * 100) if step.total else 100
    step.progress = 100
    step.elapsed = "00:00"


def run_financial_refresh(financial_fn=None):
    """独立执行步骤1：财报数据刷新。"""
    if financial_fn is None:
        from app.data.fetch_fundamental import fetch_financial_reports
        financial_fn = fetch_financial_reports
    group = STATE["fundamental"]
    step = group.steps[0]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        _refresh_financial_reports(group, financial_fn)
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise


def run_forecasts_refresh(forecast_fn=None, express_fn=None):
    """独立执行步骤2：业绩预告快报刷新。"""
    if forecast_fn is None:
        from app.data.fetch_fundamental import fetch_forecasts
        forecast_fn = fetch_forecasts
    if express_fn is None:
        from app.data.fetch_fundamental import fetch_express_reports
        express_fn = fetch_express_reports
    group = STATE["fundamental"]
    step = group.steps[1]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        _refresh_forecasts(group, forecast_fn, express_fn)
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise


def run_industry_refresh(industries_fn=None, industry_hist_fn=None, constituents_fn=None):
    """独立执行步骤3：申万行业指数刷新。"""
    if industries_fn is None:
        from app.data.fetch_fundamental import get_sw_industries
        industries_fn = get_sw_industries
    if industry_hist_fn is None:
        from app.data.fetch_fundamental import get_industry_index_hist
        industry_hist_fn = get_industry_index_hist
    if constituents_fn is None:
        from app.data.fetch_fundamental import get_industry_constituents
        constituents_fn = get_industry_constituents
    group = STATE["fundamental"]
    step = group.steps[2]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        _refresh_industry_index(group, industries_fn, industry_hist_fn, constituents_fn)
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise


def _all_stock_codes() -> list[str]:
    """全量未退市股票代码，按代码排序，不做选股过滤。"""
    with SessionLocal() as s:
        return sorted(obj.code for obj in s.query(Stock).filter(Stock.delisted_at.is_(None)).all())


def run_research_meta_refresh(research_meta_fn=None):
    """独立执行步骤4：研报元数据刷新（全量未退市股票）。"""
    if research_meta_fn is None:
        from app.data.fetch_research import fetch_research_metadata
        research_meta_fn = fetch_research_metadata
    group = STATE["fundamental"]
    step = group.steps[3]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        codes = _all_stock_codes()
        refresh_research_metadata(research_meta_fn, codes, group=group)
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise


def run_research_pdfs_refresh(research_download_fn=None, research_parse_fn=None, research_directory=None):
    """独立执行步骤5：研报PDF解析刷新（近一年研报）。依赖步骤4完成。"""
    group = STATE["fundamental"]
    step4 = group.steps[3]
    if step4.status != "done":
        raise RuntimeError("请先刷新研报元数据")
    if research_download_fn is None:
        from app.data.fetch_research import download_pdf
        research_download_fn = download_pdf
    if research_parse_fn is None:
        from app.data.fetch_research import parse_pdf_text
        research_parse_fn = parse_pdf_text
    if research_directory is None:
        research_directory = Path("backend/data/research")
    step = group.steps[4]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        refresh_research_pdfs(
            research_directory,
            download_fn=research_download_fn,
            parse_fn=research_parse_fn,
            group=group,
        )
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise


def run_fundamental_refresh(
    financial_fn=None, forecast_fn=None, express_fn=None,
    industries_fn=None, industry_hist_fn=None, constituents_fn=None,
    research_meta_fn=None,
    research_download_fn=None, research_parse_fn=None,
    research_directory=None,
) -> None:
    """一键全刷：步骤1/2/3并发，4→5串行。"""
    include_research = any(
        fn is not None
        for fn in (research_meta_fn, research_download_fn, research_parse_fn)
    )
    group = STATE["fundamental"]
    group.status = "running"
    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=3) as pool:
            futs = {
                pool.submit(run_financial_refresh, financial_fn): 0,
                pool.submit(run_forecasts_refresh, forecast_fn, express_fn): 1,
                pool.submit(run_industry_refresh, industries_fn, industry_hist_fn, constituents_fn): 2,
            }
            errors = []
            for fut in as_completed(futs):
                try:
                    fut.result()
                except Exception as exc:
                    errors.append(exc)  # 错误已记录在 step.error 中
            if errors:
                raise errors[0]

        if include_research:
            run_research_meta_refresh(research_meta_fn)
            run_research_pdfs_refresh(research_download_fn, research_parse_fn, research_directory)

        group.status = "done"
        group.updatedAt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        group.status = "error"
        group.error = str(e)
        raise


def _fetch_research_metadata_safe(fetch_fn: Callable[[str], list[dict]], code: str) -> list[dict]:
    try:
        return fetch_fn(code)
    except Exception:
        logger.warning("研报元数据 %s 抓取失败，跳过", code, exc_info=True)
        return []


def refresh_research_metadata(
    fetch_fn: Callable[[str], list[dict]],
    codes: list[str],
    group: Optional[RefreshGroup] = None,
    max_workers: int = RESEARCH_META_WORKERS,
) -> None:
    """按传入的股票代码逐个抓取研报元数据（akshare 按 symbol 查询，无全市场接口）。

    每只股票的抓取是独立的网络请求（I/O 等待为主），用线程池并发抓取；
    数据库写入仍在主线程串行执行，避免 SQLAlchemy session 跨线程使用。
    """
    step = group.steps[3] if group is not None else None
    if step is not None:
        step.total = len(codes)
        step.done = 0
        step.progress = 0
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with SessionLocal() as s, ThreadPoolExecutor(max_workers=max_workers) as pool, tqdm(total=len(codes), desc="研报元数据") as bar:
        for batch_start in range(0, len(codes), max_workers):
            batch = codes[batch_start:batch_start + max_workers]
            for code, rows in zip(batch, pool.map(lambda c: _fetch_research_metadata_safe(fetch_fn, c), batch)):
                for row in rows:
                    obj = s.query(ResearchReport).filter_by(report_id=row["report_id"]).one_or_none()
                    if obj is None:
                        obj = ResearchReport(report_id=row["report_id"], code=row["code"], title=row["title"], published_at=row["published_at"], stage="metadata")
                        s.add(obj)
                        s.flush()
                    obj.code = row["code"]
                    obj.name = row.get("name")
                    obj.title = row["title"]
                    obj.org = row.get("org")
                    obj.published_at = row["published_at"]
                    obj.summary = row.get("summary")
                    obj.pdf_url = row.get("pdf_url")
                    obj.updated_at = now
                if step is not None:
                    step.done += 1
                    step.progress = int(step.done / step.total * 100) if step.total else 100
                bar.update(1)
        s.commit()
    if step is not None:
        step.progress = 100
        step.elapsed = "00:00"


def _download_and_parse(
    row: ResearchReport,
    download_fn: Callable[[str, Path], str],
    parse_fn: Callable[[str], str],
    directory: Path,
) -> Optional[tuple[str, str]]:
    if not row.pdf_url:
        return None
    pdf_path = download_fn(row.pdf_url, directory)
    return pdf_path, parse_fn(pdf_path)


def refresh_research_pdfs(
    directory: Path,
    download_fn: Callable[[str, Path], str],
    parse_fn: Callable[[str], str],
    group: Optional[RefreshGroup] = None,
    max_workers: int = RESEARCH_PDF_WORKERS,
) -> None:
    """下载并解析研报 PDF。

    每份研报的下载是独立的网络请求（I/O 等待为主），用线程池并发下载+解析；
    数据库写入仍在主线程串行执行，避免 SQLAlchemy session 跨线程使用。
    """
    step = group.steps[4] if group is not None else None
    cutoff = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
    with SessionLocal() as s:
        rows = (
            s.query(ResearchReport)
            .filter(
                ResearchReport.stage != "parsed",
                ResearchReport.published_at >= cutoff,
            )
            .all()
        )
        if step is not None:
            step.total = len(rows)
            step.done = 0
            step.progress = 0
        with ThreadPoolExecutor(max_workers=max_workers) as pool, tqdm(total=len(rows), desc="研报PDF解析") as bar:
            for batch_start in range(0, len(rows), max_workers):
                batch = rows[batch_start:batch_start + max_workers]
                results = pool.map(lambda row: _download_and_parse(row, download_fn, parse_fn, directory), batch)
                for i, (row, result) in enumerate(zip(batch, results), batch_start + 1):
                    if result is not None:
                        pdf_path, text = result
                        row.pdf_path = pdf_path
                        row.content_text = text
                        row.stage = "parsed"
                        row.updated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    if step is not None:
                        step.done = i
                        step.progress = int(i / step.total * 100) if step.total else 100
                    bar.update(1)
        s.commit()
    if step is not None:
        step.progress = 100
        step.elapsed = "00:00"


def get_status_snapshot() -> dict:
    """返回 STATE 的序列化快照。

    任务 running 时，内存中的 step 数据即为后台线程写入的实时进度；
    idle/done/error 时，用数据库实际入库量回填（兜底，避免进程重启后丢失）。
    """

    def _grp(g):
        return {"status": g.status, "updatedAt": g.updatedAt,
                "error": g.error, "steps": [dict(vars(s)) for s in g.steps]}

    result = {k: _grp(v) for k, v in STATE.items()}

    # 只在没有活跃任务时用数据库回填进度（兜底，避免进程重启后丢失）
    # 如果数据库被写锁占用（并发刷新），跳过回填，下次轮询再试
    if result["kline"]["status"] != "running":
        try:
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
        except Exception:
            pass

    if result["fundamental"]["status"] != "running":
        try:
            with SessionLocal() as s:
                report_count = s.query(FinancialReport).count()
                forecast_count = s.query(Forecast).count()
                industry_count = s.query(IndustryIndex).group_by(IndustryIndex.code).count()
                research_meta_count = s.query(ResearchReport).filter(ResearchReport.stage == "metadata").count()
                research_parsed_count = s.query(ResearchReport).filter(ResearchReport.stage == "parsed").count()

            f_steps = result["fundamental"]["steps"]

            # 正在运行的步骤由后台任务实时维护 done/total/progress，
            # 此处的数据库回填仅用于兜底（idle/done/error 状态），不应覆盖实时进度。
            if report_count > 0 and f_steps[0]["status"] != "running":
                f_steps[0]["total"] = max(f_steps[0]["total"], report_count)
                f_steps[0]["done"] = report_count
                f_steps[0]["progress"] = 100
                if f_steps[0]["status"] == "idle":
                    f_steps[0]["status"] = "done"

            if forecast_count > 0 and f_steps[1]["status"] != "running":
                f_steps[1]["total"] = max(f_steps[1]["total"], forecast_count)
                f_steps[1]["done"] = forecast_count
                f_steps[1]["progress"] = 100
                if f_steps[1]["status"] == "idle":
                    f_steps[1]["status"] = "done"

            if industry_count > 0 and f_steps[2]["status"] != "running":
                f_steps[2]["total"] = max(f_steps[2]["total"], industry_count)
                f_steps[2]["done"] = industry_count
                f_steps[2]["progress"] = 100
                if f_steps[2]["status"] == "idle":
                    f_steps[2]["status"] = "done"

            if research_meta_count > 0 and f_steps[3]["status"] != "running":
                f_steps[3]["total"] = max(f_steps[3]["total"], research_meta_count)
                f_steps[3]["done"] = research_meta_count
                f_steps[3]["progress"] = 100
                if f_steps[3]["status"] == "idle":
                    f_steps[3]["status"] = "done"

            if research_parsed_count > 0 and f_steps[4]["status"] != "running":
                f_steps[4]["total"] = max(f_steps[4]["total"], research_parsed_count)
                f_steps[4]["done"] = research_parsed_count
                f_steps[4]["progress"] = 100
                if f_steps[4]["status"] == "idle":
                    f_steps[4]["status"] = "done"
        except Exception:
            pass

    return result
