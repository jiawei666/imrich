from __future__ import annotations

from typing import Optional, Any

import numpy as np
import pandas as pd
from scipy.signal import find_peaks


def compute_zhixing_short_trend(df: pd.DataFrame, span: int = 10) -> pd.Series:
    """知行短期趋势线（白线）: EMA(EMA(C, span), span)"""
    ema1 = df["close"].ewm(span=span, adjust=False).mean()
    ema2 = ema1.ewm(span=span, adjust=False).mean()
    return ema2


def compute_zhixing_bull_bear(
    df: pd.DataFrame, m1: int = 14, m2: int = 28, m3: int = 57, m4: int = 114,
) -> pd.Series:
    """知行多空线（黄线）: (MA(C,M1)+MA(C,M2)+MA(C,M3)+MA(C,M4))/4"""
    ma1 = df["close"].rolling(window=m1, min_periods=1).mean()
    ma2 = df["close"].rolling(window=m2, min_periods=1).mean()
    ma3 = df["close"].rolling(window=m3, min_periods=1).mean()
    ma4 = df["close"].rolling(window=m4, min_periods=1).mean()
    return (ma1 + ma2 + ma3 + ma4) / 4


def compute_kdj(df: pd.DataFrame, n: int = 9) -> pd.DataFrame:
    if df.empty:
        return df.assign(K=np.nan, D=np.nan, J=np.nan)
    low_n = df["low"].rolling(window=n, min_periods=1).min()
    high_n = df["high"].rolling(window=n, min_periods=1).max()
    rsv = (df["close"] - low_n) / (high_n - low_n + 1e-9) * 100
    K = np.zeros_like(rsv, dtype=float)
    D = np.zeros_like(rsv, dtype=float)
    for i in range(len(df)):
        if i == 0:
            K[i] = D[i] = 50.0
        else:
            K[i] = 2 / 3 * K[i - 1] + 1 / 3 * rsv.iloc[i]
            D[i] = 2 / 3 * D[i - 1] + 1 / 3 * K[i]
    J = 3 * K - 2 * D
    return df.assign(K=K, D=D, J=J)


def compute_bbi(df: pd.DataFrame) -> pd.Series:
    ma3 = df["close"].rolling(3).mean()
    ma6 = df["close"].rolling(6).mean()
    ma12 = df["close"].rolling(12).mean()
    ma24 = df["close"].rolling(24).mean()
    return (ma3 + ma6 + ma12 + ma24) / 4


def compute_rsv(df: pd.DataFrame, n: int) -> pd.Series:
    low_n = df["low"].rolling(window=n, min_periods=1).min()
    high_close_n = df["close"].rolling(window=n, min_periods=1).max()
    rsv = (df["close"] - low_n) / (high_close_n - low_n + 1e-9) * 100.0
    return rsv


def compute_dif(df: pd.DataFrame, fast: int = 12, slow: int = 26) -> pd.Series:
    ema_fast = df["close"].ewm(span=fast, adjust=False).mean()
    ema_slow = df["close"].ewm(span=slow, adjust=False).mean()
    return ema_fast - ema_slow


def _find_peaks(
    df: pd.DataFrame, *, column: str = "high", distance: Optional[int] = None,
    prominence: Optional[float] = None, height: Optional[float] = None,
    width: Optional[float] = None, rel_height: float = 0.5, **kwargs: Any,
) -> pd.DataFrame:
    if column not in df.columns:
        raise KeyError(f"'{column}' not found in DataFrame columns: {list(df.columns)}")
    y = df[column].to_numpy()
    indices, props = find_peaks(
        y, distance=distance, prominence=prominence, height=height,
        width=width, rel_height=rel_height, **kwargs,
    )
    peaks_df = df.iloc[indices].copy()
    peaks_df["is_peak"] = True
    for key, arr in props.items():
        if isinstance(arr, (list, np.ndarray)) and len(arr) == len(indices):
            peaks_df[f"peak_{key}"] = arr
    return peaks_df


def bbi_deriv_uptrend(
    bbi: pd.Series, *, min_window: int, max_window: Optional[int] = None,
    q_threshold: float = 0.0,
) -> bool:
    """判断 BBI 是否整体上升（自最长窗口向下搜索，任一窗口满足即通过）。"""
    if not 0.0 <= q_threshold <= 1.0:
        raise ValueError("q_threshold 必须位于 [0, 1] 区间内")
    bbi = bbi.dropna()
    if len(bbi) < min_window:
        return False
    longest = min(len(bbi), max_window or len(bbi))
    for w in range(longest, min_window - 1, -1):
        seg = bbi.iloc[-w:]
        norm = seg / seg.iloc[0]
        diffs = np.diff(norm.values)
        if np.quantile(diffs, q_threshold) >= 0:
            return True
    return False
