from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Callable, List, Optional

import pandas as pd
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from tqdm import tqdm

from app.db import SessionLocal
from app.models import (
    FinancialReport,
    Forecast,
    Industry,
    IndustryResearchReport,
    IndexConstituent,
    IndustryIndex,
    KlineDay,
    ResearchReport,
    KlineMonth,
    KlineQuarter,
    KlineWeek,
    RefreshRun,
    RefreshStepState,
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
    last_beat: float = 0.0  # 最近一次观察到进度推进的 epoch 秒（心跳，仅内存）


# 进程世代 token：每次进程启动重新生成。持久表里 status==running 但 instance_id
# 与本值不符，说明那条 running 是上一个已退出进程留下的 → 判中断。
INSTANCE_ID = uuid.uuid4().hex

HEARTBEAT_INTERVAL = 3.0   # 心跳守护线程的轮询周期（秒）
STALE_THRESHOLD = 120.0    # running 超过该秒数无进度推进则判僵死


def _new_state():
    return {
        "kline": RefreshGroup(steps=[
            RefreshStep("股票列表"), RefreshStep("K线数据（日+周+月+季）")]),
        "fundamental": RefreshGroup(steps=[
            RefreshStep("财报数据"), RefreshStep("业绩预告快报"),
            RefreshStep("行业与指数数据"), RefreshStep("研报元数据"),
            RefreshStep("产业研报元数据"),
            RefreshStep("研报PDF解析")]),
        "all": RefreshGroup(),
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


def run_stock_list_refresh(constituents_fn=None):
    """独立执行步骤1：股票列表 diff（分页抓取 + 写库 + 退市软删除）。"""
    if constituents_fn is None:
        from app.data.fetch_kline import get_constituents
        constituents_fn = "default"

    group = STATE["kline"]
    step = group.steps[0]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    started = time.time()

    try:
        if constituents_fn == "default":
            from app.data.fetch_kline import get_constituents
            def _on_page(current, total):
                if total > 0:
                    step.total = total
                    step.done = current
                    step.progress = int(current / total * 100)
                    step.elapsed = _fmt(time.time() - started)
            constituents_fn = lambda: get_constituents(DEFAULT_MIN_CAP, progress_callback=_on_page)

        rows = constituents_fn()
        step.total = step.done = len(rows)
        step.progress = 100
        step.elapsed = _fmt(time.time() - started)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # run_full_refresh 阶段1中本任务与行业成分股回填并发写 stocks，二者都走
        # "查不到则插入" 的逻辑，可能同时插入同一 code 触发唯一约束冲突。整体重试：
        # 重试时并发方已提交，s.get 命中后改走更新路径，冲突自然消解。
        for attempt in range(5):
            try:
                with SessionLocal() as s:
                    current_codes = set()
                    for r in tqdm(rows, desc="股票列表写库"):
                        if _cancel_flag:
                            step.status = "done"
                            step.error = "服务关闭，任务中断"
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
                    for obj in s.query(Stock).all():
                        if obj.code not in current_codes and obj.delisted_at is None:
                            obj.delisted_at = now
                    s.commit()
                break
            except IntegrityError:
                if attempt == 4:
                    raise
                logger.warning("股票列表写库唯一约束冲突，第 %d 次重试", attempt + 1, exc_info=True)
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise


def run_kline_data_refresh(kline_fn=None):
    """独立执行步骤2：K线全量重抓 + 周/月/季K重采样。依赖步骤1完成（或已有股票数据）。"""
    if kline_fn is None:
        from app.data.fetch_kline import get_kline_ak_tx
        kline_fn = lambda code: get_kline_ak_tx(code, "", "")

    group = STATE["kline"]
    step = group.steps[1]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None

    try:
        with SessionLocal() as s:
            active = [obj.code for obj in s.query(Stock).filter(Stock.delisted_at.is_(None)).all()]

        step.total = len(active)
        step.done = 0
        step.progress = 0
        t0 = time.time()
        for i, code in enumerate(tqdm(active, desc="K线数据刷新（日+周+月+季）"), 1):
            if _cancel_flag:
                step.status = "done"
                step.error = "服务关闭，任务中断"
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
            step.done = i
            step.progress = int(i / step.total * 100) if step.total else 100
            step.elapsed = _fmt(time.time() - t0)

        step.status = "done"
        # 两步都完成才标记 kline 整体 done
        if group.steps[0].status == "done":
            group.status = "done"
            group.updatedAt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        step.status = "error"
        step.error = str(e)
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
    industries_first_fn: Optional[Callable[[], list]] = None,
) -> None:
    step = group.steps[2]

    if industries_first_fn is None:
        from app.data.fetch_fundamental import get_sw_industries_first
        industries_first_fn = get_sw_industries_first

    # 写入一级行业维度表
    try:
        with SessionLocal() as s:
            for ind in industries_first_fn():
                obj = s.get(Industry, ind["code"])
                if obj is None:
                    obj = Industry(code=ind["code"])
                    s.add(obj)
                obj.name = ind["name"]
                obj.level = 1
                obj.parent_name = None
            s.commit()
    except Exception:
        logger.warning("一级行业写入失败", exc_info=True)

    industries = industries_fn()

    # 写入二级行业维度表
    try:
        with SessionLocal() as s:
            for ind in industries:
                obj = s.get(Industry, ind["code"])
                if obj is None:
                    obj = Industry(code=ind["code"])
                    s.add(obj)
                obj.name = ind["name"]
                obj.level = 2
                obj.parent_name = ind.get("parent_name")
            s.commit()
    except Exception:
        logger.warning("二级行业写入失败", exc_info=True)

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
                    try:
                        stock = Stock(code=code, name="", is_st=False, is_bj=code.startswith("bj"))
                        s.add(stock)
                        s.flush()
                    except Exception:
                        # 并发场景下 run_stock_list_refresh 可能已插入同名股票
                        s.rollback()
                        stock = s.get(Stock, code)
                        if stock is None:
                            raise
                stock.industry = industry["name"]
                stock.parent_industry = industry.get("parent_name")
            s.commit()
        step.done = i
        step.progress = int(i / step.total * 90) if step.total else 90  # 行业占90%，指数占10%

    # 注意：不在此处设 progress=100，因为还有指数成分股步骤
    # run_industry_refresh 会在 refresh_index_constituents 完成后设 100
    # 单独调用 _refresh_industry_index 时，progress 停在 90


def _backfill_stock_parent_industry() -> int:
    """从本地 industries(level=2) 维度表把一级行业名回填到 stocks.parent_industry。

    以 stock.industry(申万二级名) 关联 industries.name(level=2) 取其 parent_name(申万一级名)，
    纯本地操作、无需联网。即使行业指数刷新时 constituents 抓取部分失败，也能让 parent_industry
    与 industry 保持一致。用单条批量 UPDATE 完成，锁窗口最小、不扰动并发刷新。返回受影响股票数。
    """
    with SessionLocal() as s:
        result = s.execute(
            text(
                """
                UPDATE stocks
                SET parent_industry = (
                    SELECT i.parent_name FROM industries i
                    WHERE i.level = 2 AND i.name = stocks.industry
                )
                WHERE industry IS NOT NULL AND EXISTS (
                    SELECT 1 FROM industries i
                    WHERE i.level = 2 AND i.name = stocks.industry
                      AND i.parent_name IS NOT NULL
                      AND (stocks.parent_industry IS NULL OR stocks.parent_industry != i.parent_name)
                )
                """
            )
        )
        s.commit()
        return result.rowcount


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


def run_industry_refresh(
    industries_fn=None,
    industry_hist_fn=None,
    constituents_fn=None,
    industries_first_fn=None,
    index_constituents_fn=None,
    backfill=True,
):
    """独立执行步骤3：行业与指数数据刷新（申万行业指数 + 宽基指数成分股）。

    backfill=True 时在最后把一级行业名回填到 stocks.parent_industry。run_full_refresh 中
    本任务与股票列表刷新并发写 stocks，会与回填争用写锁，故那里传 backfill=False，改由
    run_full_refresh 在所有并发任务结束后统一回填。
    """
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
        _refresh_industry_index(group, industries_fn, industry_hist_fn, constituents_fn, industries_first_fn)
        refresh_index_constituents(index_constituents_fn, step=step)
        if backfill:
            _backfill_stock_parent_industry()
        step.progress = 100
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise


def refresh_index_constituents(
    constituents_fn: Optional[Callable[[str], list]] = None,
    index_list: Optional[list[tuple[str, str]]] = None,
    step: Optional[RefreshStep] = None,
) -> None:
    """刷新宽基指数成分股（中证系），供 /indices 接口及蓝筹筛选使用。"""
    if constituents_fn is None:
        from app.data.fetch_fundamental import get_index_constituents
        constituents_fn = get_index_constituents
    if index_list is None:
        from app.data.fetch_fundamental import CS_INDEX_LIST
        index_list = CS_INDEX_LIST

    total = len(index_list)
    for i, (index_code, index_name) in enumerate(index_list, 1):
        try:
            codes = constituents_fn(index_code)
        except Exception:
            logger.warning("宽基指数 %s 成分股抓取失败", index_code, exc_info=True)
            continue
        with SessionLocal() as s:
            s.query(IndexConstituent).filter_by(index_code=index_code).delete()
            for code in codes:
                s.add(IndexConstituent(index_code=index_code, stock_code=code, index_name=index_name))
            s.commit()
        if step is not None and total > 0:
            step.progress = 90 + int(i / total * 10)  # 90%→100%


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


def refresh_industry_research_metadata(
    fetch_fn: Callable[[], list[dict]],
    group: Optional[RefreshGroup] = None,
) -> None:
    """抓取东方财富行业研报元数据并落库。"""
    step = group.steps[4] if group is not None else None
    rows = fetch_fn()
    if step is not None:
        step.total = len(rows)
        step.done = 0
        step.progress = 0
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with SessionLocal() as s, tqdm(total=len(rows), desc="产业研报元数据") as bar:
        for row in rows:
            industry = (row.get("industry") or "").strip()
            if not industry:
                continue
            obj = s.query(IndustryResearchReport).filter_by(report_id=row["report_id"]).one_or_none()
            if obj is None:
                obj = IndustryResearchReport(
                    report_id=row["report_id"],
                    industry=industry,
                    title=row["title"],
                    published_at=row["published_at"],
                    stage="metadata",
                )
                s.add(obj)
                s.flush()
            obj.industry = industry
            obj.title = row["title"]
            obj.org = row.get("org")
            obj.published_at = row["published_at"]
            obj.summary = row.get("summary")
            obj.pdf_url = row.get("pdf_url")
            if obj.stage != "parsed":
                obj.stage = "metadata"
            obj.updated_at = now
            if step is not None:
                step.done += 1
                step.progress = int(step.done / step.total * 100) if step.total else 100
            bar.update(1)
        s.commit()
    if step is not None:
        step.progress = 100
        step.elapsed = "00:00"


def run_industry_research_meta_refresh(research_meta_fn=None):
    """独立执行步骤5：产业研报元数据刷新。"""
    if research_meta_fn is None:
        from app.data.fetch_research import fetch_industry_research_metadata
        research_meta_fn = fetch_industry_research_metadata
    group = STATE["fundamental"]
    step = group.steps[4]
    if step.status == "running":
        return
    step.status = "running"
    step.error = None
    try:
        refresh_industry_research_metadata(research_meta_fn, group=group)
        step.status = "done"
    except Exception as e:
        step.status = "error"
        step.error = str(e)
        raise


def run_research_pdfs_refresh(research_download_fn=None, research_parse_fn=None, research_directory=None):
    """独立执行步骤6：研报PDF解析刷新（近一年个股研报 + 产业研报）。"""
    _backfill_state_from_db()
    group = STATE["fundamental"]
    step4 = group.steps[3]
    step5 = group.steps[4]
    if step4.status != "done":
        raise RuntimeError("请先刷新研报元数据")
    if step5.status != "done":
        raise RuntimeError("请先刷新产业研报元数据")
    if research_download_fn is None:
        from app.data.fetch_research import download_pdf
        research_download_fn = download_pdf
    if research_parse_fn is None:
        from app.data.fetch_research import parse_pdf_text
        research_parse_fn = parse_pdf_text
    if research_directory is None:
        research_directory = Path("data/research")
    step = group.steps[5]
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


def run_full_refresh(
    stock_list_constituents_fn=None, kline_fn=None,
    financial_fn=None, forecast_fn=None, express_fn=None,
    industries_fn=None, industry_hist_fn=None, constituents_fn=None,
    industries_first_fn=None, index_constituents_fn=None,
    research_meta_fn=None,
    industry_research_meta_fn=None,
    research_download_fn=None, research_parse_fn=None,
    research_directory=None,
) -> None:
    """一键更新全部：按依赖图分四阶段并发执行 8 个任务。

    阶段1（并行）: ①股票列表 ③财报 ④预告快报 ⑤行业指数
    阶段2（①完成后并行）: ②K线数据 ⑥研报元数据
    阶段3（⑥完成后）: ⑦产业研报元数据
    阶段4（⑦完成后）: ⑧研报PDF解析
    """
    group = STATE["all"]
    if group.status == "running":
        return
    group.status = "running"
    group.error = None
    # 同步标记子组为 running
    STATE["kline"].status = "running"
    STATE["fundamental"].status = "running"
    try:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=7) as pool:
            all_futures = []
            # 阶段1：无依赖，并行提交
            stock_list_fut = pool.submit(run_stock_list_refresh, stock_list_constituents_fn)
            all_futures += [
                stock_list_fut,
                pool.submit(run_financial_refresh, financial_fn),
                pool.submit(run_forecasts_refresh, forecast_fn, express_fn),
                pool.submit(run_industry_refresh, industries_fn, industry_hist_fn, constituents_fn, industries_first_fn, index_constituents_fn, backfill=False),
            ]
            # 阶段2：① 完成后提交
            stock_list_fut.exception()  # 阻塞等待①（成功或失败都继续）
            research_meta_fut = pool.submit(run_research_meta_refresh, research_meta_fn)
            all_futures += [
                pool.submit(run_kline_data_refresh, kline_fn),
                research_meta_fut,
            ]
            # 阶段3：⑥ 完成后提交
            research_meta_fut.exception()
            industry_research_meta_fut = pool.submit(run_industry_research_meta_refresh, industry_research_meta_fn)
            all_futures.append(industry_research_meta_fut)
            # 阶段4：⑦ 完成后提交
            industry_research_meta_fut.exception()
            all_futures.append(
                pool.submit(run_research_pdfs_refresh, research_download_fn, research_parse_fn, research_directory)
            )
            errors = []
            for fut in as_completed(all_futures):
                exc = fut.exception()
                if exc is not None:
                    errors.append(exc)
        if errors:
            raise errors[0]
        # 所有并发任务已结束，此处单线程回填一级行业，避免与股票列表刷新争用 stocks 写锁。
        _backfill_stock_parent_industry()
        group.status = "done"
        group.updatedAt = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        # 同步标记子组为 done（子任务各自管理 step，但 group 可能未更新）
        now_str = group.updatedAt
        fg = STATE["fundamental"]
        if all(s.status == "done" for s in fg.steps):
            fg.status = "done"
            fg.updatedAt = now_str
        kg = STATE["kline"]
        if all(s.status == "done" for s in kg.steps):
            kg.status = "done"
            kg.updatedAt = now_str
    except Exception as e:
        group.status = "error"
        group.error = str(e)
        # 同步标记 fundamental/kline 组为 error（子任务已设置 step.error，但 group 可能未更新）
        for g in (STATE["fundamental"], STATE["kline"]):
            if g.status == "running":
                g.status = "error"
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
                    industry = (row.get("industry") or "").strip()
                    if industry:
                        industry_obj = s.query(IndustryResearchReport).filter_by(report_id=row["report_id"]).one_or_none()
                        if industry_obj is None:
                            industry_obj = IndustryResearchReport(
                                report_id=row["report_id"],
                                industry=industry,
                                title=row["title"],
                                published_at=row["published_at"],
                                stage="metadata",
                            )
                            s.add(industry_obj)
                            s.flush()
                        industry_obj.industry = industry
                        industry_obj.title = row["title"]
                        industry_obj.org = row.get("org")
                        industry_obj.published_at = row["published_at"]
                        industry_obj.summary = row.get("summary")
                        industry_obj.pdf_url = row.get("pdf_url")
                        if industry_obj.stage != "parsed":
                            industry_obj.stage = "metadata"
                        industry_obj.updated_at = now
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
    try:
        pdf_path = download_fn(row.pdf_url, directory)
        return pdf_path, parse_fn(pdf_path)
    except Exception:
        logger.warning("研报PDF下载/解析失败 report_id=%s url=%s，跳过", row.report_id, row.pdf_url, exc_info=True)
        return None


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
    step = group.steps[5] if group is not None else None
    cutoff = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
    with SessionLocal() as s:
        stock_rows = (
            s.query(ResearchReport)
            .filter(
                ResearchReport.stage != "parsed",
                ResearchReport.published_at >= cutoff,
            )
            .all()
        )
        industry_rows = (
            s.query(IndustryResearchReport)
            .filter(
                IndustryResearchReport.stage != "parsed",
                IndustryResearchReport.published_at >= cutoff,
            )
            .all()
        )
        rows = [*stock_rows, *industry_rows]
        if step is not None:
            step.total = len(rows)
            step.done = 0
            step.progress = 0
        # 全量刷新耗时很长（数千份研报），每个 batch 提交一次，避免进程中途被中断
        # （如 uvicorn --reload）时丢失已处理的进度。expire_on_commit=False
        # 避免 commit 后下一 batch 的 worker 线程触发跨线程的延迟加载。
        s.expire_on_commit = False
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


def _backfill_state_from_db():
    """根据数据库实际数据回填 STATE 中 idle 步骤的 status/done/total/progress。

    进程重启后 STATE 全部重置为 idle，但数据库可能已有数据。
    此函数让 STATE 反映真实进度，使依赖检查（如 research-pdfs 依赖 research-meta）不误判。
    """
    # kline 回填
    if STATE["kline"].status != "running":
        try:
            with SessionLocal() as s:
                stock_count = s.query(Stock).filter(Stock.delisted_at.is_(None)).count()
                kline_stock_count = s.query(KlineDay).group_by(KlineDay.code).count()

            k_steps = STATE["kline"].steps
            if stock_count > 0 and k_steps[0].status not in ("running",):
                k_steps[0].total = max(k_steps[0].total, stock_count)
                k_steps[0].done = stock_count
                k_steps[0].progress = int(stock_count / k_steps[0].total * 100)
                if k_steps[0].status == "idle":
                    k_steps[0].status = "done"

            if stock_count > 0 and k_steps[1].status not in ("running",):
                k_steps[1].total = max(k_steps[1].total, stock_count)
                k_steps[1].done = kline_stock_count
                k_steps[1].progress = int(kline_stock_count / stock_count * 100)
                if k_steps[1].status == "idle":
                    k_steps[1].status = "done"
        except Exception:
            pass

    # fundamental 回填
    if STATE["fundamental"].status != "running":
        try:
            with SessionLocal() as s:
                report_count = s.query(FinancialReport).count()
                forecast_count = s.query(Forecast).count()
                industry_count = s.query(IndustryIndex).group_by(IndustryIndex.code).count()
                research_meta_count = s.query(ResearchReport).filter(ResearchReport.stage == "metadata").count()
                industry_research_meta_count = s.query(IndustryResearchReport).filter(IndustryResearchReport.stage == "metadata").count()
                pdf_cutoff = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")
                stock_recent_parsed_count = (
                    s.query(ResearchReport)
                    .filter(ResearchReport.stage == "parsed", ResearchReport.published_at >= pdf_cutoff)
                    .count()
                )
                stock_recent_pending_count = (
                    s.query(ResearchReport)
                    .filter(ResearchReport.stage != "parsed", ResearchReport.published_at >= pdf_cutoff)
                    .count()
                )
                industry_recent_parsed_count = (
                    s.query(IndustryResearchReport)
                    .filter(IndustryResearchReport.stage == "parsed", IndustryResearchReport.published_at >= pdf_cutoff)
                    .count()
                )
                industry_recent_pending_count = (
                    s.query(IndustryResearchReport)
                    .filter(IndustryResearchReport.stage != "parsed", IndustryResearchReport.published_at >= pdf_cutoff)
                    .count()
                )

            f_steps = STATE["fundamental"].steps

            if report_count > 0 and f_steps[0].status not in ("running",):
                f_steps[0].total = max(f_steps[0].total, report_count)
                f_steps[0].done = report_count
                f_steps[0].progress = 100
                if f_steps[0].status == "idle":
                    f_steps[0].status = "done"

            if forecast_count > 0 and f_steps[1].status not in ("running",):
                f_steps[1].total = max(f_steps[1].total, forecast_count)
                f_steps[1].done = forecast_count
                f_steps[1].progress = 100
                if f_steps[1].status == "idle":
                    f_steps[1].status = "done"

            if industry_count > 0 and f_steps[2].status not in ("running",):
                f_steps[2].total = max(f_steps[2].total, industry_count)
                f_steps[2].done = industry_count
                # 行业与指数数据：同时检查 IndustryIndex 和 IndexConstituent
                with SessionLocal() as s2:
                    has_index_constituents = s2.query(IndexConstituent).limit(1).count() > 0
                f_steps[2].progress = 100 if has_index_constituents else 90
                if f_steps[2].status == "idle":
                    f_steps[2].status = "done"

            if research_meta_count > 0 and f_steps[3].status not in ("running",):
                f_steps[3].total = max(f_steps[3].total, research_meta_count)
                f_steps[3].done = research_meta_count
                f_steps[3].progress = 100
                if f_steps[3].status == "idle":
                    f_steps[3].status = "done"

            if industry_research_meta_count > 0 and f_steps[4].status not in ("running",):
                f_steps[4].total = max(f_steps[4].total, industry_research_meta_count)
                f_steps[4].done = industry_research_meta_count
                f_steps[4].progress = 100
                if f_steps[4].status == "idle":
                    f_steps[4].status = "done"

            recent_parsed_count = stock_recent_parsed_count + industry_recent_parsed_count
            recent_pending_count = stock_recent_pending_count + industry_recent_pending_count
            recent_pdf_total = recent_parsed_count + recent_pending_count
            if recent_pdf_total > 0 and f_steps[5].status not in ("running",):
                f_steps[5].total = recent_pdf_total
                f_steps[5].done = recent_parsed_count
                f_steps[5].progress = int(recent_parsed_count / recent_pdf_total * 100)
                if recent_pending_count == 0 and f_steps[5].status == "idle":
                    f_steps[5].status = "done"
        except Exception:
            pass


def _detect_stale() -> None:
    """运行时僵死检测：running 但心跳超过阈值未推进 → 判僵死置 error。

    last_beat 由心跳守护线程在观察到进度推进时更新；last_beat==0 表示守护线程
    尚未观察过（或测试场景无守护线程），此时不做判定以免误杀。
    """
    now = time.time()
    for g in STATE.values():
        if g.status != "running" or g.last_beat <= 0:
            continue
        if now - g.last_beat > STALE_THRESHOLD:
            g.status = "error"
            g.error = g.error or "任务超时无响应（可能已卡死）"
            for s in g.steps:
                if s.status == "running":
                    s.status = "error"
                    s.error = s.error or "任务超时无响应"


def get_status_snapshot() -> dict:
    """返回 STATE 的序列化快照（纯内存，毫秒级）。

    任务 running 时，内存 step 即后台线程写入的实时进度。进程重启后的恢复由
    `load_state_from_db()` 在启动时一次性完成，不在此热路径上 count 大表。
    """
    _detect_stale()

    def _grp(g):
        return {"status": g.status, "updatedAt": g.updatedAt,
                "error": g.error, "steps": [dict(vars(s)) for s in g.steps]}

    return {k: _grp(v) for k, v in STATE.items()}


# ---------------------------------------------------------------------------
# 进度持久化 + 心跳守护线程 + 启动恢复
# ---------------------------------------------------------------------------

_STEP_FIELDS = ("label", "status", "error", "done", "total", "elapsed", "progress")


def persist_state() -> None:
    """把内存 STATE 落库到 refresh_runs / refresh_steps（upsert）。

    running 的 group 才写入 instance_id 与 heartbeat_at，作为存活/世代凭证。
    """
    now_iso = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with SessionLocal() as s:
            for key, g in STATE.items():
                run = s.get(RefreshRun, key)
                if run is None:
                    run = RefreshRun(group_key=key)
                    s.add(run)
                run.status = g.status
                run.updated_at = g.updatedAt or now_iso
                run.error = g.error
                if g.status == "running":
                    run.instance_id = INSTANCE_ID
                    run.heartbeat_at = g.last_beat or time.time()
                else:
                    run.instance_id = None
                    run.heartbeat_at = None
                for idx, step in enumerate(g.steps):
                    row = s.get(RefreshStepState, (key, idx))
                    if row is None:
                        row = RefreshStepState(group_key=key, idx=idx)
                        s.add(row)
                    for f in _STEP_FIELDS:
                        setattr(row, f, getattr(step, f))
            s.commit()
    except Exception:
        logger.exception("persist_state 失败")


def _progress_fingerprint(g: RefreshGroup) -> tuple:
    return (g.status, tuple((s.status, s.done, s.progress) for s in g.steps))


_hb_thread: Optional[threading.Thread] = None
_hb_prev_fp: dict = {}
_hb_last_persisted_fp: Optional[tuple] = None


def _heartbeat_once() -> None:
    """观察 STATE：进度指纹变化即视为有推进，刷新 last_beat；整体有变才落库。"""
    global _hb_last_persisted_fp
    now = time.time()
    for key, g in STATE.items():
        fp = _progress_fingerprint(g)
        if _hb_prev_fp.get(key) != fp:
            g.last_beat = now
            _hb_prev_fp[key] = fp
    overall = tuple(_progress_fingerprint(g) for g in STATE.values())
    if overall != _hb_last_persisted_fp:
        persist_state()
        _hb_last_persisted_fp = overall


def _heartbeat_loop() -> None:
    while True:
        try:
            _heartbeat_once()
        except Exception:
            logger.exception("心跳循环异常")
        time.sleep(HEARTBEAT_INTERVAL)


def start_heartbeat() -> None:
    """启动心跳守护线程（幂等）。仅在真实服务启动时调用，测试不触发。"""
    global _hb_thread
    if _hb_thread is not None and _hb_thread.is_alive():
        return
    _hb_thread = threading.Thread(target=_heartbeat_loop, name="refresh-heartbeat", daemon=True)
    _hb_thread.start()


def load_state_from_db() -> None:
    """进程启动时从持久表恢复 STATE。

    - 持久表为空：用 `_backfill_state_from_db()` 从真实数据 seed（保留"反映实际数据"语义），
      并落库供后续启动直接读取。
    - 持久表有数据：逐行恢复；status==running 但 instance_id 与本进程不符的，
      判为上一个进程留下的中断，置 error（token 对账，秒级，不靠等心跳超时）。
    """
    try:
        with SessionLocal() as s:
            runs = {r.group_key: r for r in s.query(RefreshRun).all()}
            steps: dict = {}
            for row in s.query(RefreshStepState).all():
                steps.setdefault(row.group_key, {})[row.idx] = row
    except Exception:
        logger.exception("load_state_from_db 读取失败")
        return

    if not runs:
        _backfill_state_from_db()
        persist_state()
        return

    for key, g in STATE.items():
        run = runs.get(key)
        if run is None:
            continue
        g.status = run.status
        g.updatedAt = run.updated_at
        g.error = run.error
        for idx, step in enumerate(g.steps):
            row = steps.get(key, {}).get(idx)
            if row is None:
                continue
            for f in _STEP_FIELDS:
                setattr(step, f, getattr(row, f))
        # token 对账：上一个进程遗留的 running 判为中断
        if g.status == "running" and run.instance_id != INSTANCE_ID:
            g.status = "error"
            g.error = "上次刷新因进程退出中断"
            for step in g.steps:
                if step.status == "running":
                    step.status = "error"
                    step.error = "进程中断"
