from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, List, Optional

import pandas as pd

from app.db import SessionLocal
from app.models import Stock, KlineDay, KlineWeek, KlineMonth, KlineQuarter
from app.data.resample import resample_ohlcv

DEFAULT_MIN_CAP = 5e9  # 50亿元市值门槛


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
    constituents_fn: Optional[Callable[[], list]] = None,
    kline_fn: Optional[Callable[[str], pd.DataFrame]] = None,
) -> None:
    """任务组A：股票列表 diff + 日K全量重抓 + 周/月/季K重采样。"""
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
        # —— 步骤1：股票列表 ——
        step1 = group.steps[0]
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
    except Exception:
        group.status = "error"
        raise
