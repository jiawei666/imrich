from __future__ import annotations

from typing import Any


WEIGHTS = {
    "highGrowth": 22,
    "newHigh": 18,
    "beatExpect": 16,
    "oversold": 15,
    "oversoldBluechipA": 20,
    "oversoldBluechipB": 20,
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
    if row.get("oversold"):
        signals.append("oversold")
    scenario = row.get("oversold_scenario")
    if scenario == "A":
        signals.append("oversoldBluechipA")
    elif scenario == "B":
        signals.append("oversoldBluechipB")
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
    # 蓝筹策略: 回撤深度加成
    if row.get("oversold_bluechip"):
        dd = float(row.get("drawdown_from_high") or 0)
        raw += min(max(dd - 0.25, 0) / 0.05, 10)
        ttm = row.get("ttm_yoy")
        if ttm is not None and ttm > 0:
            raw += min(ttm / 10, 10)
    # 超级成长策略
    raw += min(max((row.get("netProfitYoY") or 0) - 50, 0), 20) * 0.2
    raw += min(max((row.get("revenueYoY") or 0) - 20, 0), 20) * 0.1
    return round(min(raw, 100), 1)


def _has_common_risk(row: dict) -> bool:
    """通用风险硬排除：利润持续下滑 + 股价创历史新低"""
    return bool(row.get("risk_profit_decline") or row.get("risk_price_new_low"))


def _candidate(row: dict) -> dict:
    signals = _display_signals(row)
    scored = {**row, "signals": signals}
    research = [signal for signal in signals if signal in (row.get("research_signals") or [])]
    core = [signal for signal in signals if signal not in research]
    # 核心信号在前、研报信号在后，完整下发；由前端决定展示几个、其余收进 +N
    ordered_signals = core + research
    risks = [
        {"label": "股价创历史新低", "ok": not row.get("risk_price_new_low")},
        {"label": "行业景气下行", "ok": not row.get("risk_industry_down")},
    ]
    # 蓝筹策略用结构恶化替代利润持续下滑
    if row.get("is_bluechip"):
        risks.append({"label": "业绩结构恶化", "ok": not row.get("risk_structural_decline")})
    else:
        risks.append({"label": "业绩持续下滑", "ok": not row.get("risk_profit_decline")})
    return {
        "code": row["code"],
        "name": row.get("name") or row["code"],
        "industry": row.get("industry") or "",
        "score": score_candidate(scored),
        "signals": ordered_signals,
        "netProfitYoY": float(row.get("netProfitYoY") or 0),
        "revenueYoY": float(row.get("revenueYoY") or 0),
        "drawdownFromHigh": float(row.get("drawdown_from_high") or 0),
        "risks": risks,
    }


def run_fundamental_screen_from_rows(preset_id: str, rows: list[dict], params: dict[str, Any]) -> list[dict]:
    out: list[dict] = []
    for row in rows:
        if preset_id == "super-growth":
            if _has_common_risk(row):
                continue
            if not (
                row.get("high_growth") and row.get("price_new_high") and row.get("research_signals")
                and (row.get("revenueYoY") or 0) > params.get("revenueYoY", 20)
            ):
                continue
        elif preset_id == "oversold-bluechip":
            # 蓝筹硬性条件 + 错杀判定
            if not row.get("is_bluechip"):
                continue
            if not row.get("oversold_bluechip"):
                continue
            if row.get("risk_price_new_low"):
                continue
        else:
            raise KeyError(f"未知基本面预设: {preset_id}")
        out.append(_candidate(row))
    out.sort(key=lambda item: (item["score"], item["code"]), reverse=True)
    return out


def run_fundamental_screen(preset_id: str, params: dict[str, Any]) -> list[dict]:
    from app.fundamental_rows import build_fundamental_rows

    return run_fundamental_screen_from_rows(preset_id, build_fundamental_rows(params), params)
