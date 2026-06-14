from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable, Optional


def _get_value(row: object, key: str) -> Optional[float]:
    if isinstance(row, dict):
        value = row.get(key)
    else:
        value = getattr(row, key, None)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def compute_single_quarter_series(
    report_dates: list[str],
    cumulative: list[Optional[float]],
) -> list[Optional[float]]:
    out: list[Optional[float]] = []
    for i, rd in enumerate(report_dates):
        current = cumulative[i]
        if i == 0 or rd.endswith("-03-31"):
            out.append(current)
            continue
        previous = cumulative[i - 1]
        if current is None or previous is None:
            out.append(None)
        else:
            out.append(current - previous)
    return out


def high_growth(yoy_pct: Optional[float], threshold: float = 50.0) -> bool:
    return yoy_pct is not None and yoy_pct > threshold


def profit_new_high(profit_series: list[Optional[float]]) -> bool:
    if not profit_series or profit_series[-1] is None:
        return False
    history = [value for value in profit_series if value is not None]
    return bool(history) and profit_series[-1] >= max(history)


def beat_expect(
    current_yoy: Optional[float],
    history_yoys: Optional[list[Optional[float]]] = None,
    forecast_change_pct: Optional[float] = None,
    threshold: float = 50.0,
) -> bool:
    if forecast_change_pct is not None:
        return forecast_change_pct > threshold
    if current_yoy is None or not history_yoys:
        return False
    history = sorted(value for value in history_yoys if value is not None)
    if not history:
        return False
    mid = len(history) // 2
    median = history[mid] if len(history) % 2 else (history[mid - 1] + history[mid]) / 2
    return current_yoy > median


def _near_high(series: list[float], tolerance: float = 0.0) -> bool:
    if not series:
        return False
    highest = max(series)
    return highest > 0 and series[-1] >= highest * (1 - tolerance)


def price_new_high(closes: list[float], tolerance: float = 0.05) -> bool:
    return _near_high(closes, tolerance)


def industry_new_high(arg: object) -> bool:
    if isinstance(arg, str):
        return False
    closes = list(arg)
    return _near_high(closes, tolerance=0.0)


def low_position_oversold(
    closes: list[float],
    current_yoy: Optional[float],
    drawdown_threshold: float = 0.35,
    yoy_threshold: float = 0.0,
) -> bool:
    if not closes or current_yoy is None or current_yoy <= yoy_threshold:
        return False
    peak = max(closes)
    if peak <= 0:
        return False
    drawdown = 1 - closes[-1] / peak
    return drawdown > drawdown_threshold


def risk_price_new_low(closes: list[float]) -> bool:
    return bool(closes) and closes[-1] <= min(closes)


def risk_profit_decline(rows: Iterable[object]) -> bool:
    yoys = [_get_value(row, "net_profit_yoy") for row in rows]
    if len(yoys) < 3 or yoys[-1] is None or yoys[-2] is None or yoys[-3] is None:
        return False
    return yoys[-3] > yoys[-2] > yoys[-1]


def risk_industry_down(arg: object) -> bool:
    if isinstance(arg, str):
        return False
    values = [value for value in arg if value is not None]
    if not values:
        return False
    if values[-1] < 0:
        return True
    if len(values) < 2:
        return False
    return values[-1] < values[-2] < values[0]


# ── 蓝筹策略专用信号 ──────────────────────────────────────────

BLUECHIP_INDEX_CODES = {"000016", "000300", "000905"}  # 上证50 / 沪深300 / 中证500


def is_bluechip(code: str, bluechip_codes: set[str]) -> bool:
    """蓝筹判定：股票是否在宽基蓝筹指数成分股集合内。"""
    return code in bluechip_codes


def calc_ttm_yoy(reports: list[Any]) -> Optional[float]:
    """计算 TTM 同比（精确 TTM → 年报同比 → Q1 同比兜底）"""
    if not reports:
        return None
    by_year: dict[str, dict[str, Any]] = defaultdict(dict)
    for r in reports:
        year = r.report_date[:4]
        month = r.report_date[5:7]
        if month == "03":
            by_year[year]["Q1"] = r
        elif month == "06":
            by_year[year]["H1"] = r
        elif month == "09":
            by_year[year]["Q3"] = r
        elif month == "12":
            by_year[year]["Annual"] = r

    years = sorted(by_year.keys())
    if len(years) < 2:
        return None

    # ── 方法 1: 精确 TTM ──
    current_ttm = prior_ttm = None
    curr_y, prev_y = years[-1], years[-2]
    if "Q1" in by_year[curr_y] and "Annual" in by_year[prev_y] and "Q1" in by_year[prev_y]:
        q1n = by_year[curr_y]["Q1"].net_profit
        ap = by_year[prev_y]["Annual"].net_profit
        q1p = by_year[prev_y]["Q1"].net_profit
        if q1n is not None and ap is not None and q1p is not None:
            current_ttm = q1n + (ap - q1p)
    if len(years) >= 3:
        ppy = years[-3]
        if "Q1" in by_year[prev_y] and "Annual" in by_year[ppy] and "Q1" in by_year[ppy]:
            q1p = by_year[prev_y]["Q1"].net_profit
            app = by_year[ppy]["Annual"].net_profit
            q1pp = by_year[ppy]["Q1"].net_profit
            if q1p is not None and app is not None and q1pp is not None:
                prior_ttm = q1p + (app - q1pp)
    if current_ttm and prior_ttm and prior_ttm > 0:
        return (current_ttm / prior_ttm - 1) * 100

    # ── 方法 2: 年报同比 ──
    annual_years = [y for y in years if "Annual" in by_year[y]]
    if len(annual_years) >= 2:
        a_new = by_year[annual_years[-1]]["Annual"].net_profit
        a_old = by_year[annual_years[-2]]["Annual"].net_profit
        if a_old and a_old > 0 and a_new is not None:
            return (a_new / a_old - 1) * 100

    # ── 方法 3: Q1 同比兜底 ──
    if "Q1" in by_year.get(curr_y, {}) and "Q1" in by_year.get(prev_y, {}):
        q1_new = by_year[curr_y]["Q1"].net_profit_yoy
        if q1_new is not None:
            return q1_new

    return None


def oversold_scenario(
    closes: list[float],
    ttm_yoy: Optional[float],
    drawdown_min: float = 0.25,
    ttm_threshold: float = -15,
    deep_drawdown: float = 0.50,
    deep_ttm_threshold: float = -30,
    annual_net_profit: Optional[float] = None,
) -> Optional[str]:
    """蓝筹错杀命中的场景：'B'(深度超跌) 优先于 'A'(普通超跌)，都不满足返回 None。"""
    if not closes or ttm_yoy is None:
        return None
    peak = max(closes)
    if peak <= 0:
        return None
    drawdown = 1 - closes[-1] / peak

    if (
        drawdown >= deep_drawdown
        and ttm_yoy > deep_ttm_threshold
        and annual_net_profit is not None
        and annual_net_profit > 0
    ):
        return "B"
    if drawdown >= drawdown_min and ttm_yoy > ttm_threshold:
        return "A"
    return None


def risk_structural_decline(
    ttm_yoy: Optional[float],
    reports: list[Any],
) -> bool:
    """业绩结构恶化：TTM 同比 < -15% 且毛利率同比降 > 3pct 且营收同比 < 0"""
    if ttm_yoy is None or ttm_yoy >= -15:
        return False
    recent = sorted(reports, key=lambda r: r.report_date)
    recent_with_gm = [r for r in recent if r.gross_margin is not None]
    if len(recent_with_gm) < 2:
        return False
    gm_decline = recent_with_gm[-2].gross_margin - recent_with_gm[-1].gross_margin
    if gm_decline < 3:
        return False
    latest = recent[-1]
    rev_yoy = latest.revenue_yoy if latest.revenue_yoy is not None else 0
    return rev_yoy < 0
