from __future__ import annotations

from typing import Any


WEIGHTS = {
    "highGrowth": 22,
    "newHigh": 18,
    "beatExpect": 16,
    "sectorEffect": 12,
    "industryNewHigh": 10,
    "alpha": 12,
    "orderFull": 5,
    "capexExpand": 5,
    "newProduct": 5,
    "domesticSub": 5,
    "industryRecover": 5,
    "valuationRepair": 5,
}


def _display_signals(row: dict) -> list[str]:
    signals: list[str] = []
    if row.get("high_growth"):
        signals.append("highGrowth")
    if row.get("price_new_high"):
        signals.append("newHigh")
    if row.get("beat_expect"):
        signals.append("beatExpect")
    if row.get("sector_effect"):
        signals.append("sectorEffect")
    if row.get("industry_new_high"):
        signals.append("industryNewHigh")
    if row.get("alpha"):
        signals.append("alpha")
    signals.extend(row.get("research_signals") or [])
    return list(dict.fromkeys(signals))


def score_candidate(row: dict) -> float:
    raw = sum(WEIGHTS.get(signal, 0) for signal in row.get("signals", []))
    raw += min(max((row.get("netProfitYoY") or 0) - 50, 0), 20) * 0.2
    raw += min(max((row.get("revenueYoY") or 0) - 20, 0), 20) * 0.1
    return round(min(raw, 100), 1)


def _has_common_risk(row: dict) -> bool:
    return bool(row.get("risk_profit_decline") or row.get("risk_price_new_low"))


def _candidate(row: dict) -> dict:
    signals = _display_signals(row)
    scored = {**row, "signals": signals}
    research = [signal for signal in signals if signal in (row.get("research_signals") or [])]
    core = [signal for signal in signals if signal not in research]
    visible = core[:5]
    if research:
        visible.extend(research[: max(0, 6 - len(visible))])
    if len(visible) < 6:
        visible.extend(core[5 : 5 + (6 - len(visible))])
    visible = visible[:6]
    return {
        "code": row["code"],
        "name": row.get("name") or row["code"],
        "industry": row.get("industry") or "",
        "score": score_candidate(scored),
        "signals": visible,
        "extraSignals": max(len(signals) - len(visible), 0),
        "netProfitYoY": float(row.get("netProfitYoY") or 0),
        "revenueYoY": float(row.get("revenueYoY") or 0),
    }


def run_fundamental_screen_from_rows(preset_id: str, rows: list[dict], params: dict[str, Any]) -> list[dict]:
    out: list[dict] = []
    for row in rows:
        if _has_common_risk(row):
            continue
        if preset_id == "super-growth":
            if not (row.get("high_growth") and row.get("price_new_high") and row.get("research_signals")):
                continue
        elif preset_id == "oversold-bluechip":
            if row.get("risk_industry_down") or not row.get("oversold"):
                continue
        else:
            raise KeyError(f"未知基本面预设: {preset_id}")
        out.append(_candidate(row))
    out.sort(key=lambda item: (item["score"], item["code"]), reverse=True)
    return out


def run_fundamental_screen(preset_id: str, params: dict[str, Any]) -> list[dict]:
    from app.fundamental_rows import build_fundamental_rows

    return run_fundamental_screen_from_rows(preset_id, build_fundamental_rows(params), params)
