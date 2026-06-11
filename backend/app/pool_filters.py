from __future__ import annotations

from datetime import datetime


def _days_between(start: str, end: str) -> int:
    return (datetime.strptime(end[:10], "%Y-%m-%d") - datetime.strptime(start[:10], "%Y-%m-%d")).days


def is_default_pool_stock(row: dict, as_of: str, min_listed_days: int = 365) -> bool:
    if row.get("is_st") or row.get("is_bj") or row.get("delisted_at"):
        return False
    listed_at = row.get("listed_at")
    if listed_at and _days_between(listed_at, as_of) < min_listed_days:
        return False
    return True


def filter_default_pool(rows: list[dict], as_of: str, min_listed_days: int = 365) -> list[dict]:
    return [row for row in rows if is_default_pool_stock(row, as_of, min_listed_days)]
