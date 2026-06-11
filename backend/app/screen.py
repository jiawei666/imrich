from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd

from app.db import SessionLocal
from app.models import Stock, KlineDay
from app.presets import build_selector, _NAMES


def _load_kline_data() -> Dict[str, pd.DataFrame]:
    """读所有未退市股票的日K，返回 {code: df(date,open,close,high,low,volume)}。"""
    data: Dict[str, pd.DataFrame] = {}
    with SessionLocal() as s:
        active = [code for (code,) in s.query(Stock.code).filter(Stock.delisted_at.is_(None)).all()]
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


def run_technical_screen(preset_id: str, params: Dict[str, Any]) -> List[dict]:
    selector = build_selector(preset_id, params)
    data = _load_kline_data()
    if not data:
        return []
    date = max(df["date"].max() for df in data.values())
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
    return candidates
