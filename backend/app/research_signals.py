from __future__ import annotations

from datetime import date, datetime, timedelta


KEYWORD_TO_SIGNAL = [
    ("订单饱满", "orderFull"),
    ("产能扩张", "capexExpand"),
    ("新产品", "newProduct"),
    ("国产替代", "domesticSub"),
    ("行业复苏", "industryRecover"),
    ("估值修复", "valuationRepair"),
]


def _to_date(value: str) -> date:
    return datetime.strptime(value[:10], "%Y-%m-%d").date()


def keyword_hits(text: str) -> list[str]:
    return [signal for keyword, signal in KEYWORD_TO_SIGNAL if keyword in (text or "")]


def has_research_keyword(reports: list[dict], as_of: str, window_days: int = 90) -> bool:
    cutoff = _to_date(as_of) - timedelta(days=window_days)
    as_of_date = _to_date(as_of)
    for report in reports:
        published = _to_date(report["published_at"])
        if published < cutoff or published > as_of_date:
            continue
        text = "\n".join(
            [report.get("title") or "", report.get("summary") or "", report.get("content_text") or ""]
        )
        if keyword_hits(text):
            return True
    return False


def sector_effect(industry: str, rows: list[dict], threshold: int = 3) -> bool:
    count = sum(
        1
        for row in rows
        if row.get("industry") == industry and row.get("high_growth") and row.get("research_hit")
    )
    return count >= threshold


def alpha_rank(code: str, rows: list[dict], top_n: int = 3) -> bool:
    target = next((row for row in rows if row.get("code") == code), None)
    if target is None:
        return False
    peers = [row for row in rows if row.get("industry") == target.get("industry")]
    ranked = sorted(
        peers,
        key=lambda row: (
            row.get("return_pct") or 0,
            row.get("net_profit_yoy") or 0,
            row.get("market_cap") or 0,
        ),
        reverse=True,
    )
    return code in [row.get("code") for row in ranked[:top_n]]
