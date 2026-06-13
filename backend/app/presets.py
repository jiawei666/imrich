from __future__ import annotations

from typing import Any, Dict, List

from app.selectors import SELECTOR_REGISTRY

# 标量可调参数 schema + 默认值（取自旧项目 configs.json）
_PARAM_SPECS: Dict[str, List[dict]] = {
    "trend-support": [
        {"key": "pct_chg_min", "label": "涨跌幅下限", "value": -2.0, "min": -10, "max": 0, "step": 0.1, "unit": "%"},
        {"key": "pct_chg_max", "label": "涨跌幅上限", "value": 1.8, "min": 0, "max": 10, "step": 0.1, "unit": "%"},
        {"key": "j_threshold", "label": "J 值绝对阈值", "value": 15, "min": -20, "max": 50, "step": 1},
        {"key": "j_q_threshold", "label": "J 值分位阈值", "value": 0.1, "min": 0, "max": 1, "step": 0.05},
        {"key": "max_window", "label": "回溯窗口", "value": 90, "min": 30, "max": 250, "step": 5, "unit": "日"},
        {"key": "tolerance", "label": "价格容差", "value": 0.01, "min": 0, "max": 0.1, "step": 0.005},
        {"key": "white_span", "label": "白线周期", "value": 10, "min": 3, "max": 30, "step": 1},
    ],
    "b2": [
        {"key": "vol_ratio", "label": "放量倍数", "value": 1.0, "min": 0.5, "max": 3, "step": 0.1},
        {"key": "up_threshold", "label": "涨幅阈值", "value": 4.0, "min": 0, "max": 10, "step": 0.5, "unit": "%"},
        {"key": "j_ceil", "label": "J 值上限", "value": 85.0, "min": 50, "max": 100, "step": 1},
        {"key": "j_prev_threshold", "label": "前日 J 阈值", "value": -5.0, "min": -20, "max": 20, "step": 1},
        {"key": "j_prev_q_threshold", "label": "前日 J 分位", "value": 0.1, "min": 0, "max": 1, "step": 0.05},
        {"key": "max_window", "label": "回溯窗口", "value": 90, "min": 30, "max": 250, "step": 5, "unit": "日"},
    ],
}

# 不进 UI 的固定默认（嵌套结构）
_FIXED_DEFAULTS: Dict[str, dict] = {
    "trend-support": {"yellow_m_args": [14, 28, 57, 114]},
    "b2": {"trend_params": {
        "pct_chg_min": -2.0, "pct_chg_max": 1.8, "j_threshold": -5.0,
        "j_q_threshold": 0.10, "max_window": 90, "tolerance": 0.01,
        "white_span": 10, "yellow_m_args": [14, 28, 57, 114]}},
}

_NAMES = {"trend-support": "双线战法", "b2": "B2战法"}

_FUNDAMENTAL_PRESETS = [
    {
        "id": "super-growth",
        "category": "fundamental",
        "name": "创新高超级成长",
        "params": [
            {"key": "netProfitYoY", "label": "净利润同比下限", "value": 50, "min": 0, "max": 200, "step": 5, "unit": "%"},
            {"key": "revenueYoY", "label": "营收同比下限", "value": 20, "min": 0, "max": 200, "step": 5, "unit": "%"},
            {"key": "keywordWindow", "label": "研报关键词时间窗", "value": 90, "min": 30, "max": 180, "step": 30, "unit": "日"},
            {"key": "industry", "label": "行业过滤", "type": "select", "value": "", "options": []},
        ],
    },
    {
        "id": "oversold-bluechip",
        "category": "fundamental",
        "name": "低位错杀蓝筹",
        "params": [
            {"key": "drawdownMin", "label": "距一年高回撤下限", "value": 35, "min": 10, "max": 80, "step": 5, "unit": "%"},
            {"key": "netProfitYoY", "label": "净利润同比下限", "value": 0, "min": -50, "max": 100, "step": 5, "unit": "%"},
            {"key": "keywordWindow", "label": "研报关键词时间窗", "value": 90, "min": 30, "max": 180, "step": 30, "unit": "日"},
            {"key": "industry", "label": "行业过滤", "type": "select", "value": "", "options": []},
        ],
    },
]


def get_presets() -> List[dict]:
    out = [dict(preset) for preset in _FUNDAMENTAL_PRESETS]

    # 动态填充 industry 参数的 options（从 Industry 表查询）
    try:
        from app.db import SessionLocal
        from app.models import Industry
        with SessionLocal() as s:
            industries = s.query(Industry).filter(Industry.level == 2).order_by(Industry.parent_name, Industry.name).all()
        options = [{"value": "", "label": "全部行业"}]
        for ind in industries:
            options.append({
                "value": ind.name,
                "label": ind.name,
                "group": ind.parent_name or "",
            })
        for preset in out:
            for param in preset.get("params", []):
                if param.get("key") == "industry":
                    param["options"] = options
    except Exception:
        pass

    for pid, specs in _PARAM_SPECS.items():
        out.append({
            "id": pid, "category": "technical", "name": _NAMES[pid],
            "params": [dict(s) for s in specs],
        })
    return out


def build_selector(preset_id: str, params: Dict[str, Any]):
    if preset_id not in SELECTOR_REGISTRY:
        raise KeyError(f"未知预设: {preset_id}")
    kwargs = {s["key"]: s["value"] for s in _PARAM_SPECS[preset_id]}
    kwargs.update(_FIXED_DEFAULTS.get(preset_id, {}))
    for k, v in (params or {}).items():
        if k in kwargs:
            kwargs[k] = v
    return SELECTOR_REGISTRY[preset_id](**kwargs)
