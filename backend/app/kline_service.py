from __future__ import annotations

from typing import Any, Dict

import pandas as pd

from app.db import SessionLocal
from app.models import KlineDay, KlineWeek, KlineMonth, KlineQuarter
from app.indicators import (
    compute_kdj, compute_zhixing_short_trend, compute_zhixing_bull_bear,
)

_MODELS = {"day": KlineDay, "week": KlineWeek, "month": KlineMonth, "quarter": KlineQuarter}


def get_stock_kline(code: str, period: str) -> Dict[str, Any]:
    if period not in _MODELS:
        raise ValueError(f"period 仅支持 {list(_MODELS)}")
    model = _MODELS[period]
    with SessionLocal() as s:
        rows = (s.query(model.date, model.open, model.close, model.high, model.low, model.volume)
                .filter_by(code=code).order_by(model.date).all())
    if not rows:
        return {"data": [], "highLine": 0.0, "highLabel": "历史高点"}
    df = pd.DataFrame(rows, columns=["date", "open", "close", "high", "low", "volume"])
    kdj = compute_kdj(df)
    white = compute_zhixing_short_trend(df, span=10)
    yellow = compute_zhixing_bull_bear(df)

    def _round(x):
        return None if pd.isna(x) else round(float(x), 3)

    data = []
    for i in range(len(df)):
        data.append({
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
    high_line = round(float(df["high"].max()), 2)
    return {"data": data, "highLine": high_line, "highLabel": "历史高点"}
