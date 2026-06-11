from __future__ import annotations

import pandas as pd

# pandas resample 频率别名：周/月/季末（pandas 2.2+ 使用 "ME"/"QE" 替代已弃用的 "M"/"Q"）
_RULE = {"week": "W", "month": "ME", "quarter": "QE"}


def resample_ohlcv(daily: pd.DataFrame, period: str) -> pd.DataFrame:
    """日K → 周/月/季K：open=首, high=max, low=min, close=末, volume=求和。

    输入 daily 含列 date(可转 datetime), open, high, low, close, volume。
    输出列：date(周期末日期, 'YYYY-MM-DD' 字符串), open, close, high, low, volume。
    """
    if daily.empty:
        return daily.copy()
    if period not in _RULE:
        raise ValueError(f"period 仅支持 {list(_RULE)}")
    df = daily.copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    agg = df.resample(_RULE[period]).agg(
        open=("open", "first"), high=("high", "max"),
        low=("low", "min"), close=("close", "last"), volume=("volume", "sum"),
    ).dropna(subset=["open"])
    agg = agg.reset_index()
    agg["date"] = agg["date"].dt.strftime("%Y-%m-%d")
    return agg[["date", "open", "close", "high", "low", "volume"]]
