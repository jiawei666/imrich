from app.presets import get_presets, build_selector


def test_get_presets_returns_fundamental_and_technical():
    presets = get_presets()
    ids = {p["id"] for p in presets}
    assert ids == {"super-growth", "oversold-bluechip", "trend-support", "b2"}
    assert {p["category"] for p in presets} == {"fundamental", "technical"}
    for p in presets:
        assert isinstance(p["params"], list) and len(p["params"]) > 0
        for param in p["params"]:
            assert {"key", "label", "value"} <= set(param)


def test_fundamental_presets_have_industry_param():
    presets = get_presets()
    for p in presets:
        if p["category"] == "fundamental":
            keys = {param["key"] for param in p["params"]}
            assert "industry" in keys
            industry_param = next(param for param in p["params"] if param["key"] == "industry")
            assert industry_param["type"] == "select"
            assert isinstance(industry_param.get("options"), list)


def test_super_growth_has_revenueYoY():
    p = next(p for p in get_presets() if p["id"] == "super-growth")
    keys = {param["key"] for param in p["params"]}
    assert "revenueYoY" in keys
    assert "drawdownMin" not in keys


def test_oversold_bluechip_has_drawdownMin():
    p = next(p for p in get_presets() if p["id"] == "oversold-bluechip")
    keys = {param["key"] for param in p["params"]}
    assert "drawdownMin" in keys


def test_trend_support_default_values():
    p = next(p for p in get_presets() if p["id"] == "trend-support")
    by_key = {x["key"]: x["value"] for x in p["params"]}
    assert by_key["pct_chg_min"] == -2.0
    assert by_key["pct_chg_max"] == 1.8
    assert by_key["j_threshold"] == 15


def test_build_selector_overrides_params():
    sel = build_selector("b2", {"up_threshold": 6.0})
    assert sel.up_threshold == 6.0
    assert sel.j_ceil == 85.0  # 默认仍生效


def test_build_selector_unknown_raises():
    import pytest
    with pytest.raises(KeyError):
        build_selector("nope", {})


def test_oversold_bluechip_drops_market_cap_and_quality_params():
    p = next(p for p in get_presets() if p["id"] == "oversold-bluechip")
    keys = {param["key"] for param in p["params"]}
    assert "bluechipMarketCap" not in keys
    assert "bluechipProfitQuarters" not in keys
    assert "bluechipMinGrossMargin" not in keys
    # 保留的 6 个
    assert keys == {
        "drawdownMin", "ttmYoyThreshold", "deepDrawdown",
        "deepTtmYoy", "keywordWindow", "industry",
    }
