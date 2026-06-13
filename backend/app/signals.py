from __future__ import annotations

from typing import Iterable, Optional


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
