from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from app.db import SessionLocal
from app.models import Stock, KlineDay, ScreenSnapshot
from app.presets import build_selector, _NAMES
from app.fundamental_screen import run_fundamental_screen
from app.pool_filters import filter_default_pool

logger = logging.getLogger(__name__)


def _load_kline_data() -> Dict[str, pd.DataFrame]:
    """读所有未退市股票的日K，返回 {code: df(date,open,close,high,low,volume)}。"""
    data: Dict[str, pd.DataFrame] = {}
    with SessionLocal() as s:
        stock_rows = [
            {
                "code": st.code,
                "is_st": st.is_st,
                "is_bj": st.is_bj,
                "delisted_at": st.delisted_at,
                "listed_at": st.listed_at,
            }
            for st in s.query(Stock).filter(Stock.delisted_at.is_(None)).all()
        ]
        latest_date = s.query(KlineDay.date).order_by(KlineDay.date.desc()).limit(1).scalar() or datetime.now().strftime("%Y-%m-%d")
        active = [row["code"] for row in filter_default_pool(stock_rows, latest_date)]
        rows = (s.query(KlineDay.code, KlineDay.date, KlineDay.open, KlineDay.close,
                        KlineDay.high, KlineDay.low, KlineDay.volume)
                .filter(KlineDay.code.in_(active)).order_by(KlineDay.code, KlineDay.date).all())
    if not rows:
        return data
    df = pd.DataFrame(rows, columns=["code", "date", "open", "close", "high", "low", "volume"])
    df["date"] = pd.to_datetime(df["date"])
    for code, grp in df.groupby("code"):
        data[code] = grp.drop(columns=["code"]).reset_index(drop=True)
    return data


def _stock_meta() -> Dict[str, Dict[str, Any]]:
    with SessionLocal() as s:
        return {st.code: {"name": st.name, "industry": st.industry or ""}
                for st in s.query(Stock).all()}


def _latest_kline_date() -> Optional[str]:
    with SessionLocal() as s:
        return s.query(KlineDay.date).order_by(KlineDay.date.desc()).limit(1).scalar()


def _load_snapshot(preset_id: str, data_date: str) -> Optional[ScreenSnapshot]:
    with SessionLocal() as s:
        return s.query(ScreenSnapshot).filter_by(
            preset_id=preset_id, data_date=data_date
        ).first()


def _save_snapshot(preset_id: str, data_date: str, params_json: str,
                   candidates: List[dict]) -> None:
    try:
        with SessionLocal() as s:
            snap = s.query(ScreenSnapshot).filter_by(
                preset_id=preset_id, data_date=data_date
            ).first()
            if snap is None:
                snap = ScreenSnapshot(preset_id=preset_id, data_date=data_date)
                s.add(snap)
            snap.params_json = params_json
            snap.candidates_json = json.dumps(candidates, ensure_ascii=False)
            snap.candidate_count = len(candidates)
            snap.updated_at = datetime.now().isoformat()
            s.commit()
    except Exception:
        logger.exception("保存筛选快照失败")


def list_screen_snapshots(preset_id: str) -> List[dict]:
    with SessionLocal() as s:
        rows = (s.query(ScreenSnapshot)
                .filter_by(preset_id=preset_id)
                .order_by(ScreenSnapshot.data_date.desc())
                .all())
        return [
            {"date": r.data_date, "count": r.candidate_count, "updatedAt": r.updated_at or ""}
            for r in rows
        ]


def get_screen_snapshot(preset_id: str, data_date: str) -> Optional[List[dict]]:
    with SessionLocal() as s:
        snap = s.query(ScreenSnapshot).filter_by(
            preset_id=preset_id, data_date=data_date
        ).first()
        if snap is None:
            return None
        return json.loads(snap.candidates_json)


def run_technical_screen(preset_id: str, params: Dict[str, Any]) -> List[dict]:
    data_date = _latest_kline_date()
    if data_date is None:
        return []

    params_json = json.dumps(params or {}, sort_keys=True)
    snap = _load_snapshot(preset_id, data_date)
    if snap is not None and snap.params_json == params_json:
        return json.loads(snap.candidates_json)

    selector = build_selector(preset_id, params)
    data = _load_kline_data()
    if not data:
        return []
    date = pd.Timestamp(data_date)
    meta = _stock_meta()
    name = _NAMES.get(preset_id, preset_id)

    candidates: List[dict] = []
    for code, df in data.items():
        hist = selector._hist_for(df, date)
        if hist is None:
            continue
        diagnostics = selector.evaluate(hist)
        if diagnostics is None:
            continue
        close = float(hist["close"].iloc[-1])
        prev = float(hist["close"].iloc[-2])
        pct_chg = round((close - prev) / prev * 100, 2) if prev else 0.0
        trigger = pd.Timestamp(hist["date"].iloc[-1]).strftime("%Y-%m-%d")
        candidates.append({
            "code": code,
            "name": meta.get(code, {}).get("name", code),
            "industry": meta.get(code, {}).get("industry", ""),
            "close": round(close, 2),
            "pctChg": pct_chg,
            "strategyName": name,
            "triggerDate": trigger,
            "diagnostics": diagnostics,
            "sortKey": trigger,
        })
    candidates.sort(key=lambda c: (c["sortKey"], c["code"]), reverse=True)

    _save_snapshot(preset_id, data_date, params_json, candidates)
    return candidates


FUNDAMENTAL_PRESETS = {"super-growth", "oversold-bluechip"}
TECHNICAL_PRESETS = {"trend-support", "b2"}


def run_screen(preset_id: str, params: Dict[str, Any]) -> List[dict]:
    if preset_id in FUNDAMENTAL_PRESETS:
        return run_fundamental_screen(preset_id, params)
    if preset_id in TECHNICAL_PRESETS:
        return run_technical_screen(preset_id, params)
    raise KeyError(f"未知预设: {preset_id}")


def run_screen_result(preset_id: str, params: dict | None = None, history_date: str | None = None) -> dict:
    """统一筛选结果入口，返回 ScreenResultResponse 格式。

    - 有 params → 运行筛选
    - 有 history_date → 返回历史快照
    - 两者互斥
    """
    from app.db import SessionLocal as _SL
    from app.models import Stock as _Stock

    if params is not None and history_date is not None:
        raise ValueError("params 和 history_date 不可同时传入")

    if history_date is not None:
        candidates = get_screen_snapshot(preset_id, history_date)
        if candidates is None:
            return {"items": [], "total": 0}
    else:
        candidates = run_screen(preset_id, params or {})

    # 补充 market_cap 和 parent_industry
    codes = [c["code"] for c in candidates]
    stock_info: dict[str, dict] = {}
    if codes:
        with _SL() as s:
            for row in s.query(_Stock.code, _Stock.market_cap, _Stock.parent_industry).filter(_Stock.code.in_(codes)).all():
                stock_info[row.code] = {"market_cap": row.market_cap, "parent_industry": row.parent_industry}


    items = []
    for c in candidates:
        info = stock_info.get(c["code"], {})
        items.append({
            "code": c["code"],
            "name": c["name"],
            "industry": c.get("industry") or None,
            "parent_industry": info.get("parent_industry"),
            "market_cap": info.get("market_cap"),
            "close": c.get("close"),
            "pct_chg": c.get("pctChg"),
            "diagnostics": c.get("diagnostics"),
            "sort_key": c.get("sortKey"),
            "trigger_date": c.get("triggerDate"),
        })

    return {"items": items, "total": len(items)}


def run_fundamental_screen_result(preset_id: str, params: dict | None = None) -> dict:
    from app.fundamental_screen import run_fundamental_screen
    from app.models import FundamentalCandidate

    if preset_id not in FUNDAMENTAL_PRESETS:
        raise KeyError(f"未知基本面预设: {preset_id}")

    if params is None:
        with SessionLocal() as s:
            rows = (
                s.query(FundamentalCandidate)
                .filter_by(preset_id=preset_id)
                .order_by(FundamentalCandidate.rank)
                .all()
            )
        items = [
            {
                "code": r.code,
                "name": r.name,
                "industry": r.industry,
                "score": r.score,
                "signals": json.loads(r.signals),
                "netProfitYoY": r.net_profit_yoy,
                "revenueYoY": r.revenue_yoy,
                "risks": json.loads(r.risks),
                "drawdownFromHigh": r.drawdown_from_high,
            }
            for r in rows
        ]
        updated_at = max((r.updated_at for r in rows), default=None)
    else:
        candidates = run_fundamental_screen(preset_id, params)
        params_json = json.dumps(params, sort_keys=True)
        now = datetime.now().isoformat()
        with SessionLocal() as s:
            s.query(FundamentalCandidate).filter_by(preset_id=preset_id).delete()
            for i, c in enumerate(candidates):
                s.add(FundamentalCandidate(
                    preset_id=preset_id,
                    code=c["code"],
                    name=c["name"],
                    industry=c["industry"],
                    score=c["score"],
                    signals=json.dumps(c["signals"]),
                    net_profit_yoy=c["netProfitYoY"],
                    revenue_yoy=c["revenueYoY"],
                    drawdown_from_high=c.get("drawdownFromHigh", 0),
                    risks=json.dumps(c.get("risks", [])),
                    params_json=params_json,
                    rank=i + 1,
                    updated_at=now,
                ))
            s.commit()
        items = candidates
        updated_at = now

    return {"items": items, "total": len(items), "updatedAt": updated_at}
