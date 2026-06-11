from __future__ import annotations

from typing import Dict, List, Optional, Any

import pandas as pd

from app.indicators import (
    compute_kdj, compute_zhixing_short_trend, compute_zhixing_bull_bear,
)


class TrendSupportSelector:
    """双线战法：涨跌幅过滤 + KDJ J 值低位 + 白线>黄线 + 股价在区间内。"""

    def __init__(
        self, pct_chg_min: float = -2.0, pct_chg_max: float = 1.8,
        j_threshold: float = -5.0, j_q_threshold: float = 0.10,
        max_window: int = 90, tolerance: float = 0.01, white_span: int = 10,
        yellow_m_args: Optional[List[int]] = None,
    ) -> None:
        self.pct_chg_min = pct_chg_min
        self.pct_chg_max = pct_chg_max
        self.j_threshold = j_threshold
        self.j_q_threshold = j_q_threshold
        self.max_window = max_window
        self.tolerance = tolerance
        self.white_span = white_span
        self.yellow_m_args = yellow_m_args if yellow_m_args else [14, 28, 57, 114]
        self.needed_len = max(self.max_window, self.yellow_m_args[-1] + 20)

    def _passes_filters(self, hist: pd.DataFrame) -> bool:
        if hist.empty or len(hist) < 2:
            return False
        hist = hist.copy()
        close_today = hist["close"].iloc[-1]
        close_prev = hist["close"].iloc[-2]
        if close_prev == 0:
            return False
        pct_chg = (close_today - close_prev) / close_prev * 100
        if not (self.pct_chg_min <= pct_chg <= self.pct_chg_max):
            return False
        kdj = compute_kdj(hist)
        j_today = float(kdj.iloc[-1]["J"])
        j_window = kdj["J"].tail(self.max_window).dropna()
        if j_window.empty:
            return False
        j_quantile = float(j_window.quantile(self.j_q_threshold))
        if not (j_today < self.j_threshold or j_today <= j_quantile):
            return False
        white_line = compute_zhixing_short_trend(hist, span=self.white_span)
        yellow_line = compute_zhixing_bull_bear(
            hist, m1=self.yellow_m_args[0], m2=self.yellow_m_args[1],
            m3=self.yellow_m_args[2], m4=self.yellow_m_args[3],
        )
        val_white = white_line.iloc[-1]
        val_yellow = yellow_line.iloc[-1]
        if pd.isna(val_white) or pd.isna(val_yellow):
            return False
        if val_white <= val_yellow:
            return False
        lower_bound = val_yellow * (1 - self.tolerance)
        if not (lower_bound <= close_today):
            return False
        return True

    def diagnose(self, hist: pd.DataFrame) -> Dict[str, float]:
        hist = hist.copy()
        close_today = float(hist["close"].iloc[-1])
        close_prev = float(hist["close"].iloc[-2])
        pct_chg = (close_today - close_prev) / close_prev * 100
        kdj = compute_kdj(hist)
        j_today = float(kdj.iloc[-1]["J"])
        white = compute_zhixing_short_trend(hist, span=self.white_span)
        yellow = compute_zhixing_bull_bear(
            hist, m1=self.yellow_m_args[0], m2=self.yellow_m_args[1],
            m3=self.yellow_m_args[2], m4=self.yellow_m_args[3],
        )
        return {
            "pctChg": round(pct_chg, 2),
            "j": round(j_today, 2),
            "whiteLine": round(float(white.iloc[-1]), 3),
            "yellowLine": round(float(yellow.iloc[-1]), 3),
        }

    def _hist_for(self, df: pd.DataFrame, date: pd.Timestamp) -> Optional[pd.DataFrame]:
        hist = df[df["date"] <= date]
        if hist.empty:
            return None
        return hist.tail(self.needed_len)

    def evaluate(self, hist: pd.DataFrame) -> Optional[Dict[str, float]]:
        if not self._passes_filters(hist):
            return None
        return self.diagnose(hist)

    def select(self, date: pd.Timestamp, data: Dict[str, pd.DataFrame]) -> List[str]:
        picks: List[str] = []
        for code, df in data.items():
            hist = self._hist_for(df, date)
            if hist is not None and self._passes_filters(hist):
                picks.append(code)
        return picks


class B2Selector:
    """B2 战法：放量 + 涨幅>阈值 + J 值过滤。"""

    def __init__(
        self, vol_ratio: float = 1.0, up_threshold: float = 4.0, j_ceil: float = 65.0,
        j_prev_threshold: float = -5.0, j_prev_q_threshold: float = 0.10,
        max_window: int = 90, trend_params: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.vol_ratio = vol_ratio
        self.up_threshold = up_threshold
        self.j_ceil = j_ceil
        self.j_prev_threshold = j_prev_threshold
        self.j_prev_q_threshold = j_prev_q_threshold
        self.max_window = max_window
        self.trend_selector = TrendSupportSelector(**(trend_params or {}))
        ts_req = max(self.trend_selector.max_window,
                     self.trend_selector.yellow_m_args[-1] + 20)
        self.needed_len = max(ts_req + 10, self.max_window + 20)

    def _passes_filters(self, hist: pd.DataFrame) -> bool:
        if len(hist) < 5:
            return False
        row_curr = hist.iloc[-1]
        row_prev = hist.iloc[-2]
        if row_prev["close"] <= 0:
            return False
        pct_chg = (row_curr["close"] - row_prev["close"]) / row_prev["close"] * 100
        if pct_chg <= self.up_threshold:
            return False
        if row_prev["volume"] <= 0:
            return False
        if row_curr["volume"] <= row_prev["volume"] * self.vol_ratio:
            return False
        kdj = compute_kdj(hist)
        j_curr = float(kdj.iloc[-1]["J"])
        if j_curr >= self.j_ceil:
            return False
        j_prev = float(kdj.iloc[-2]["J"])
        j_window = kdj["J"].tail(self.max_window).dropna()
        if j_window.empty:
            return False
        j_quantile = float(j_window.quantile(self.j_prev_q_threshold))
        if not (j_prev < self.j_prev_threshold or j_prev <= j_quantile):
            return False
        return True

    def diagnose(self, hist: pd.DataFrame) -> Dict[str, float]:
        row_curr = hist.iloc[-1]
        row_prev = hist.iloc[-2]
        pct_chg = (row_curr["close"] - row_prev["close"]) / row_prev["close"] * 100
        vol_ratio = row_curr["volume"] / row_prev["volume"] if row_prev["volume"] else 0.0
        kdj = compute_kdj(hist)
        return {
            "pctChg": round(pct_chg, 2),
            "volRatio": round(float(vol_ratio), 2),
            "j": round(float(kdj.iloc[-1]["J"]), 2),
            "jPrev": round(float(kdj.iloc[-2]["J"]), 2),
        }

    def _hist_for(self, df: pd.DataFrame, date: pd.Timestamp) -> Optional[pd.DataFrame]:
        hist = df[df["date"] <= date]
        if hist.empty:
            return None
        return hist.tail(self.needed_len)

    def evaluate(self, hist: pd.DataFrame) -> Optional[Dict[str, float]]:
        if not self._passes_filters(hist):
            return None
        return self.diagnose(hist)

    def select(self, date: pd.Timestamp, data: Dict[str, pd.DataFrame]) -> List[str]:
        picks: List[str] = []
        for code, df in data.items():
            hist = self._hist_for(df, date)
            if hist is not None and self._passes_filters(hist):
                picks.append(code)
        return picks


SELECTOR_REGISTRY = {
    "trend-support": TrendSupportSelector,
    "b2": B2Selector,
}
